/**
 * POST /api/webhooks/moneroo — Moneroo payment webhook adapter.
 *
 * Thin shim over the battle-tested factory at `lib/server/webhook/handler.ts`
 * (PROTECTED — never modified). The factory does ALL the hard work: raw-body
 * read via arrayBuffer, HMAC verify, Serializable transaction, WebhookLog
 * upsert + dedup, dispatch, processedAt write-back. This file only wires:
 *   - the Moneroo-specific WebhookProvider (HMAC + payload parser)
 *   - per-event handlers that update Order/SchoolSubscriptionPayment rows
 *     and emit outbox events
 *
 * CLAUDE.md invariants honored here:
 *   - runtime = 'nodejs' is exported below (Buffer/crypto + Prisma — the
 *     runtime-enforcement test fails CI otherwise).
 *   - dynamic = 'force-dynamic' is exported below (prevents accidental POST
 *     caching by Next.js).
 *   - This file NEVER reads the request body. The factory itself reads the
 *     raw bytes for byte-identical HMAC verification — reading the body here
 *     would be a silent HMAC regression.
 *   - Side-effects use enqueueOutbox(tx, ...) INSIDE the same Serializable tx
 *     the factory opens — never via after-commit closures (D-04 outbox-not-
 *     closures invariant).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { monerooWebhookProvider } from '@/lib/server/webhook/moneroo';
import { enqueueOutbox } from '@/lib/server/outbox';
import { prisma } from '@/lib/server/prisma';
import { SUBSCRIPTION_PERIOD_MS } from '@/lib/server/billing/constants';

export const POST = createWebhookHandler({
  prisma,
  provider: monerooWebhookProvider,

  async onPaid(payload, tx) {
    const externalRef = String(payload.data?.id ?? '');
    if (!externalRef) return {}; // no id to correlate

    const order = await tx.order.findFirst({
      where: { providerChargeId: externalRef },
    });
    if (order) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID', paidAt: new Date() },
      });

      // Outbox emits stay inside the factory's Serializable tx so the rows
      // commit atomically with the status change. The drain cron picks them
      // up out-of-band.
      if (order.userId) {
        await enqueueOutbox(tx, {
          kind: 'notification.payment_received',
          payload: {
            userId: order.userId,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
          },
        });
      }
      if (order.customerEmail) {
        await enqueueOutbox(tx, {
          kind: 'email.payment_confirmation',
          payload: {
            to: order.customerEmail,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
          },
        });
      }

      return {};
    }

    // No matching Order — try a school subscription payment instead. Same
    // externalRef namespace (both use the row's own cuid as providerChargeId
    // — see POST /api/orders and POST /api/billing/subscribe), so this can
    // only ever match one or the other, never both.
    const subscriptionPayment = await tx.schoolSubscriptionPayment.findFirst({
      where: { providerChargeId: externalRef },
    });
    if (!subscriptionPayment) return {}; // unknown charge — log + drop

    const school = await tx.school.findUnique({
      where: { id: subscriptionPayment.schoolId },
      select: { currentPeriodEnd: true },
    });
    const now = new Date();
    // Extend from the later of "now" and the current period end, so paying
    // early (before the previous period lapses) stacks the new period on
    // top instead of wasting the remaining days.
    const periodStart =
      school?.currentPeriodEnd && school.currentPeriodEnd > now ? school.currentPeriodEnd : now;
    const periodEnd = new Date(periodStart.getTime() + SUBSCRIPTION_PERIOD_MS);

    await tx.schoolSubscriptionPayment.update({
      where: { id: subscriptionPayment.id },
      data: { status: 'PAID', paidAt: now, periodStart, periodEnd },
    });
    await tx.school.update({
      where: { id: subscriptionPayment.schoolId },
      // remindersSentDays reset to [] — the new period gets its own fresh
      // set of J-15/J-7/J-1 reminders rather than staying silenced by the
      // prior period's milestones.
      data: { status: 'ACTIVE', currentPeriodEnd: periodEnd, remindersSentDays: [] },
    });

    return {};
  },

  async onRefunded(payload, tx) {
    const externalRef = String(payload.data?.id ?? '');
    if (!externalRef) return {};
    const order = await tx.order.findFirst({
      where: { providerChargeId: externalRef },
    });
    if (order) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'REFUNDED' },
      });
      // No outbox emit in v1 — `notification.refund_received` kind is not
      // declared in outbox/types.ts. Adding it would touch the PROTECTED
      // dispatcher; deferred to a follow-up phase.
      return {};
    }

    const subscriptionPayment = await tx.schoolSubscriptionPayment.findFirst({
      where: { providerChargeId: externalRef },
    });
    if (!subscriptionPayment) return {};
    await tx.schoolSubscriptionPayment.update({
      where: { id: subscriptionPayment.id },
      data: { status: 'REFUNDED' },
    });
    // Deliberately NOT reverting School.status/currentPeriodEnd here — a
    // subscription refund is a billing dispute to resolve manually, not an
    // automatic access revocation (a webhook-triggered instant lockout on
    // refund is a harsher default than this product needs at this stage).
    return {};
  },

  async onFailed(payload, tx) {
    const externalRef = String(payload.data?.id ?? '');
    if (!externalRef) return {};
    const order = await tx.order.findFirst({
      where: { providerChargeId: externalRef },
    });
    if (order) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'FAILED' },
      });
      return {};
    }

    const subscriptionPayment = await tx.schoolSubscriptionPayment.findFirst({
      where: { providerChargeId: externalRef },
    });
    if (!subscriptionPayment) return {};
    await tx.schoolSubscriptionPayment.update({
      where: { id: subscriptionPayment.id },
      data: { status: 'FAILED' },
    });
    return {};
  },
});

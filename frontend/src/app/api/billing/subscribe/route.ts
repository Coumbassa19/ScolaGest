// POST /api/billing/subscribe — pay for (or renew) the school's own
// ScolaGest subscription via Bictorys. Mirrors POST /api/orders' proven
// sequence (idempotency, circuit breaker, PENDING-row-then-charge) closely
// — this is the SAME payment provider, just charging the school for its own
// platform subscription instead of a marketplace order.
//
// Price is derived server-side from the school's own School.plan (via
// planConfig() — see billing/constants.ts) — never client-supplied, so
// there's nothing for a tampered request body to manipulate.
//
// UNVERIFIED MARKET COVERAGE: Bictorys' existing integration in this
// codebase (src/lib/server/payments/bictorys.ts) was built and tested for
// Senegal (country 'SN' was hardcoded before this route existed). Whether
// Bictorys supports Guinea/GNF at all has not been confirmed — verify with
// Bictorys before relying on this in production. SUBSCRIPTION_COUNTRY below
// is passed as `metadata.country` so it's a one-constant change once that's
// confirmed (or swap providers entirely — this route only depends on the
// provider-agnostic `PaymentProvider` interface).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { CircuitOpenError } from '@/lib/server/payments/circuit-breaker';
import {
  breaker,
  getProvider,
  PaymentProviderUnconfiguredError,
} from '@/lib/server/payments/provider-singleton';
import { planConfig } from '@/lib/server/billing/constants';

const SUBSCRIPTION_CURRENCY = 'GNF';
const SUBSCRIPTION_COUNTRY = 'GN'; // see UNVERIFIED note above
const IDEM_KEY_MAX_LEN = 200;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    // skipBillingGate: true — a school whose trial/subscription already
    // lapsed must still be able to reach the one route that lets it pay its
    // way back to ACTIVE. The normal gate would otherwise lock it out of
    // fixing its own subscription.
    const auth = await requireStaff({ skipBillingGate: true });
    if (auth instanceof NextResponse) return auth;

    const schoolId = auth.user.schoolId;
    if (!schoolId) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'This account is not linked to a school.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { plan: true } });
    const price = planConfig(school?.plan ?? 'CROISSANCE').priceGNF;

    const idemKey = req.headers.get('idempotency-key') ?? '';
    if (!idemKey) {
      return NextResponse.json(
        { error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key header required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (idemKey.length > IDEM_KEY_MAX_LEN) {
      return NextResponse.json(
        {
          error: 'IDEMPOTENCY_KEY_INVALID',
          message: `Idempotency-Key exceeds ${IDEM_KEY_MAX_LEN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Replay — echo the prior outcome rather than double-charging (same
    // semantics as /api/orders; no CR-02 body-fingerprint check needed here
    // since the price/currency are fixed server-side, not client-supplied).
    const existing = await prisma.schoolSubscriptionPayment.findUnique({
      where: { idempotencyKey: idemKey },
    });
    if (existing) {
      if (existing.schoolId !== schoolId) {
        return NextResponse.json(
          {
            error: 'IDEMPOTENCY_KEY_BODY_MISMATCH',
            message: 'Idempotency-Key already used by a different school.',
          },
          { status: 422, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (existing.status === 'PENDING' || existing.status === 'PAID') {
        if (existing.status === 'PENDING' && !existing.paymentUrl) {
          return NextResponse.json(
            {
              error: 'PAYMENT_IN_FLIGHT',
              message: 'Prior attempt did not complete; retry shortly.',
            },
            {
              status: 503,
              headers: { 'x-request-id': ctx.requestId, 'Retry-After': '5' },
            },
          );
        }
        return NextResponse.json(
          { id: existing.id, paymentUrl: existing.paymentUrl, status: existing.status },
          { status: 200, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        {
          error: 'PAYMENT_PROVIDER_UNAVAILABLE',
          message: 'A previous attempt with this Idempotency-Key did not complete; submit a new key to retry.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let provider;
    try {
      provider = getProvider();
    } catch (err) {
      if (err instanceof PaymentProviderUnconfiguredError) {
        return NextResponse.json(
          { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    const envAppUrl = process.env.APP_URL;
    if (!envAppUrl && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'PAYMENT_PROVIDER_UNCONFIGURED',
          message: 'APP_URL not set; cannot construct success/failure redirect URLs.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const appUrl = envAppUrl ?? 'http://localhost:3000';

    const payment = await prisma.schoolSubscriptionPayment.create({
      data: {
        schoolId,
        amount: price,
        currency: SUBSCRIPTION_CURRENCY,
        provider: 'bictorys',
        status: 'PENDING',
        idempotencyKey: idemKey,
      },
    });

    try {
      const result = await breaker.execute(() =>
        provider.charge({
          amount: price,
          currency: SUBSCRIPTION_CURRENCY,
          customer: {
            email: auth.user.email,
          },
          metadata: { country: SUBSCRIPTION_COUNTRY },
          successUrl: `${appUrl}/billing?paid=1`,
          failureUrl: `${appUrl}/billing?failed=1`,
          externalRef: payment.id,
        }),
      );

      await prisma.schoolSubscriptionPayment.update({
        where: { id: payment.id },
        data: { providerChargeId: result.providerChargeId, paymentUrl: result.paymentUrl },
      });

      return NextResponse.json(
        { id: payment.id, paymentUrl: result.paymentUrl, status: 'PENDING' },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        await prisma.schoolSubscriptionPayment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        });
        const retryAfterSec = Math.max(1, Math.ceil((err.retryAt.getTime() - Date.now()) / 1000));
        return NextResponse.json(
          {
            error: 'PAYMENT_PROVIDER_UNAVAILABLE',
            message: 'Payment provider temporarily unavailable. Try again shortly.',
          },
          {
            status: 503,
            headers: { 'x-request-id': ctx.requestId, 'Retry-After': String(retryAfterSec) },
          },
        );
      }

      await prisma.schoolSubscriptionPayment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      const message = err instanceof Error ? err.message : 'Unknown payment error';
      return NextResponse.json(
        { error: 'PAYMENT_FAILED', message },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}

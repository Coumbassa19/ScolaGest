// Finds schools whose trial or paid subscription period ends within the
// next 15 days and emails their DIRECTION account(s) a renewal reminder at
// three milestones (J-15, J-7, J-1) — consumed by
// /api/cron/subscription-reminders (daily). Three reminders rather than one
// because a single email is easy to miss/forget.
//
// Exactly-once per milestone: School.remindersSentDays accumulates which
// milestones (15, 7, 1) have already been emailed for the CURRENT period,
// and is reset to [] when the period is extended (see the Moneroo
// webhook's onPaid), so re-running this daily doesn't re-spam the same
// milestone and the next period gets its own fresh set of reminders.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { getEmailQueue } from '../queues/email-queue-singleton';
import { subscriptionReminderEmail } from './email-templates';
import { planConfig } from './constants';
import { createLogger } from '../logger';

const log = createLogger();
// Descending: the loop picks the largest milestone still due, so a normal
// daily run only ever fires one per school (see below).
const REMINDER_MILESTONES_DAYS = [15, 7, 1];
const REMINDER_WINDOW_DAYS = REMINDER_MILESTONES_DAYS[0]!;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SendSubscriptionRemindersOptions {
  prisma: PrismaClient;
  appUrl: string;
  now?: Date;
}

export interface SendSubscriptionRemindersResult {
  /** Schools for which at least one reminder email was sent. */
  sent: number;
  /** Candidate schools skipped — no DIRECTION recipient, or the email queue is unconfigured. */
  skipped: number;
}

export async function sendSubscriptionReminders(
  opts: SendSubscriptionRemindersOptions,
): Promise<SendSubscriptionRemindersResult> {
  const now = opts.now ?? new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * DAY_MS);

  // Pre-filter out schools that already got every milestone this period —
  // the exact "which milestone is due today" decision still happens below,
  // per-school, since it depends on the precise days-remaining count.
  const notAllSent = { NOT: { remindersSentDays: { hasEvery: REMINDER_MILESTONES_DAYS } } };

  const [trialing, active] = await Promise.all([
    opts.prisma.school.findMany({
      where: { status: 'TRIALING', trialEndsAt: { lte: windowEnd, gt: now }, ...notAllSent },
      select: { id: true, name: true, plan: true, trialEndsAt: true, remindersSentDays: true },
    }),
    opts.prisma.school.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { lte: windowEnd, gt: now },
        ...notAllSent,
      },
      select: { id: true, name: true, plan: true, currentPeriodEnd: true, remindersSentDays: true },
    }),
  ]);

  const candidates = [
    ...trialing.map((s) => ({
      id: s.id,
      name: s.name,
      plan: s.plan,
      kind: 'trial' as const,
      expiresOn: s.trialEndsAt,
      remindersSentDays: s.remindersSentDays,
    })),
    ...active.map((s) => ({
      id: s.id,
      name: s.name,
      plan: s.plan,
      kind: 'subscription' as const,
      expiresOn: s.currentPeriodEnd as Date,
      remindersSentDays: s.remindersSentDays,
    })),
  ];

  if (candidates.length === 0) return { sent: 0, skipped: 0 };

  const queue = getEmailQueue();
  if (!queue) {
    log.warn('subscription-reminders: email queue not configured — skipping tick', {
      candidateCount: candidates.length,
    });
    return { sent: 0, skipped: candidates.length };
  }

  let sent = 0;
  let skipped = 0;

  for (const school of candidates) {
    const daysRemaining = Math.max(
      0,
      Math.ceil((school.expiresOn.getTime() - now.getTime()) / DAY_MS),
    );
    // Largest milestone that's due (daysRemaining has reached or passed it)
    // and hasn't been sent yet this period. A normal daily cron run only
    // ever finds one; if a run was missed and several became due at once,
    // only the nearest-term one fires today — the others already lapsed.
    const milestone = REMINDER_MILESTONES_DAYS.find(
      (m) => daysRemaining <= m && !school.remindersSentDays.includes(m),
    );
    if (milestone === undefined) continue; // nothing due for this school today

    const recipients = await opts.prisma.user.findMany({
      where: { schoolId: school.id, role: { in: ['ADMIN', 'SUPERADMIN'] }, status: 'ACTIVE' },
      select: { email: true },
    });
    if (recipients.length === 0) {
      log.warn('subscription-reminders: no admin recipient, skipping', { schoolId: school.id });
      skipped++;
      continue;
    }

    const expiresOnLabel = school.expiresOn.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const template = subscriptionReminderEmail({
      schoolName: school.name,
      expiresOnLabel,
      billingUrl: `${opts.appUrl}/billing`,
      kind: school.kind,
      daysRemaining,
      amountGNF: planConfig(school.plan).priceGNF,
      locale: 'fr',
    });

    let anySent = false;
    for (const recipient of recipients) {
      const jobId = await queue.enqueue({
        to: recipient.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
      const result = await queue.sendNow(jobId);
      if (result.status === 'SENT') anySent = true;
    }

    // Mark this milestone as reminded regardless of delivery success — a
    // transient Resend failure shouldn't retry-spam the recipient every day;
    // the next milestone (or a fresh period once remindersSentDays is reset)
    // will still get its own reminder. Delivery failures are already visible
    // via the EmailJob row.
    await opts.prisma.school.update({
      where: { id: school.id },
      data: { remindersSentDays: { push: milestone } },
    });

    if (anySent) sent++;
    else skipped++;
  }

  return { sent, skipped };
}

// Daily cron — emails each school's DIRECTION account(s) a reminder 15 days
// before its trial or paid subscription period ends. Mirrors
// order-expiration's shape (verifyCronSecret, withLease, request context).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { sendSubscriptionReminders } from '@/lib/server/billing/subscription-reminders';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000; // ~2 × maxDuration

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let sent = 0;
    let skipped = 0;

    await withLease(redis ?? undefined, 'subscription-reminders', LEASE_TTL_MS, async () => {
      const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
      const result = await sendSubscriptionReminders({ prisma, appUrl });
      sent = result.sent;
      skipped = result.skipped;
      log.info('subscription-reminders tick', { sent, skipped, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, sent, skipped },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// POST /api/demo-requests — public homepage "Demander une démo" form
// (src/components/DemoRequestForm.tsx). No auth, no CSRF (same reasoning as
// /api/schools/signup: no session exists yet on the public homepage).
//
// Sends straight to DEMO_REQUEST_EMAIL via Resend — no DB row, no outbox.
// This is a low-stakes marketing lead, not a transactional email that must
// survive a provider outage with retries (like password resets), so the
// extra durability of the outbox/queue system isn't worth the complexity
// here. If RESEND_API_KEY/EMAIL_FROM/DEMO_REQUEST_EMAIL aren't configured,
// the route fails closed with a clear 503 rather than silently dropping
// leads.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createMailer } from '@/lib/server/email';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getRedis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(30),
  message: z.string().trim().max(2000).optional(),
});

const redis = getRedis() ?? undefined;
const limiter = createEmailLimiter(
  { ...(redis ? { redis } : {}) },
  {
    bucket: 'demo-requests',
    windowMs: 60 * 60 * 1000,
    max: 5,
    code: 'TOO_MANY_DEMO_REQUESTS',
    message: 'Too many demo requests. Try again later.',
  },
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { name, phone, message } = parsed.data;

    const rl = await limiter.check(req, phone);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    const to = process.env.DEMO_REQUEST_EMAIL;
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !to) {
      log.error(
        'demo-requests: mailer not configured (RESEND_API_KEY/EMAIL_FROM/DEMO_REQUEST_EMAIL)',
      );
      return NextResponse.json(
        { error: 'SERVICE_UNAVAILABLE', message: 'Demo requests are temporarily unavailable.' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const mailer = createMailer({
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
    });
    const html = `
      <p><strong>Nouvelle demande de démo — ScolaGest</strong></p>
      <p><strong>Nom :</strong> ${escapeHtml(name)}</p>
      <p><strong>WhatsApp :</strong> ${escapeHtml(phone)}</p>
      ${message ? `<p><strong>Message :</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
    `;

    try {
      await mailer.send({ to, subject: `Demande de démo — ${name}`, html });
    } catch (err) {
      log.error('demo-requests: send failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'SEND_FAILED', message: 'Could not send the demo request. Please try again.' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    log.info('demo-requests: sent');
    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

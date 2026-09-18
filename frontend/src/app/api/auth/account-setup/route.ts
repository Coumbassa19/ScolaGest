// POST /api/auth/account-setup
//
// Consumes an ACCOUNT_SETUP VerificationCode (a long random token, not the
// 8-char typed codes EMAIL_VERIFY/PASSWORD_RESET use — see
// generateSetupToken()) and sets the password on an admin-created account
// (User.passwordHash starts NULL — see POST /api/admin/users). In one tx:
// hashes the password, sets User.passwordHash, marks emailVerifiedAt (the
// admin-sent link IS the verification — clicking it proves control of the
// inbox the admin typed in), bumps tokenVersion defensively, and marks the
// code usedAt. Does NOT issue cookies — same as reset-password, the user
// logs in fresh afterward.
//
// Looked up by token alone (no email needed) — the `[code, type]` index on
// VerificationCode already makes this an indexed lookup, and the token's
// own entropy (32 random bytes) is the proof, same trust model as a
// password-reset link in any other app.
//
// CSRF carve-out: pre-session route — the bearer of the token is the proof.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { hashPassword } from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { PASSWORD_MIN, meetsPasswordComplexity } from '@/lib/server/auth/password-policy';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const Body = z.object({
  token: z.string().trim().min(20).max(200),
  newPassword: z.string().min(1),
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const { token, newPassword } = parsed.data;

    if (isBanned(newPassword)) {
      const res = NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (newPassword.length < PASSWORD_MIN) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (!meetsPasswordComplexity(newPassword)) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_TOO_WEAK',
          message: 'Password must include an uppercase letter, a lowercase letter, and a digit.',
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(newPassword))) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_PWNED',
          message: 'This password appeared in a known data breach.',
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const codeRow = await prisma.verificationCode.findFirst({
      where: { code: token, type: 'ACCOUNT_SETUP', usedAt: null },
      select: { id: true, userId: true, expiresAt: true },
    });
    if (!codeRow) {
      const res = NextResponse.json(
        { error: 'SETUP_TOKEN_INVALID', message: 'This setup link is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (codeRow.expiresAt.getTime() < Date.now()) {
      const res = NextResponse.json(
        { error: 'SETUP_TOKEN_EXPIRED', message: 'This setup link has expired.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const passwordHash = await hashPassword(newPassword);
    try {
      await prisma.$transaction(async (tx) => {
        // Close the TOCTOU window between findFirst and this update — a
        // second concurrent request with the same token finds 0 rows and
        // the race is surfaced as SETUP_TOKEN_INVALID, same as reset-password.
        const consumed = await tx.verificationCode.updateMany({
          where: { id: codeRow.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new Error('SETUP_TOKEN_RACE');
        }
        await tx.user.update({
          where: { id: codeRow.userId },
          data: {
            passwordHash,
            emailVerifiedAt: new Date(),
            tokenVersion: { increment: 1 },
          },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'SETUP_TOKEN_RACE') {
        const res = NextResponse.json(
          { error: 'SETUP_TOKEN_INVALID', message: 'This setup link is invalid.' },
          { status: 400 },
        );
        res.headers.set('x-request-id', ctx.requestId);
        return res;
      }
      throw err;
    }

    log.info('account setup completed', { userId: codeRow.userId });
    const res = NextResponse.json({ ok: true });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}

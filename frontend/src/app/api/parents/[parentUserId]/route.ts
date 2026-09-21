// PATCH /api/parents/[parentUserId] — correct a parent account's login
// email (e.g. staff mistyped it at creation). Triggered from the "Modifier"
// button next to a linked parent on the student page
// (src/components/forms/ParentAccountPanel.tsx). Scoped by parentUserId
// rather than by student — a parent's email is a property of their one
// User account, not of any particular ParentStudent link, so this applies
// regardless of which child's panel it was opened from.
//
// Two cases:
//  - Setup not yet completed (passwordHash still null): the old
//    ACCOUNT_SETUP link — possibly already delivered to the WRONG address
//    being corrected here — is invalidated and a fresh one is issued to the
//    new address, mirroring /api/students/[id]/parents' NEW-mode creation.
//    Without this, whoever controls the old (mistyped) mailbox could still
//    use the stale link to claim the account.
//  - Setup already completed: the email is simply updated. No
//    re-verification step exists in this app for any account type (staff
//    accounts aren't verified either — see /api/admin/users), so this
//    stays consistent with that trust model: an ADMIN/DIRECTION/STAFF
//    correcting a parent's contact email is treated the same as them being
//    trusted to create the account in the first place.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, generateSetupToken } from '@/lib/server/auth';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { zEmail } from '@/lib/server/zod-helpers';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { accountSetupEmail } from '@/lib/server/auth/email-templates';
import { getRequestLocale } from '@/lib/server/request-locale';
import { log } from '@/lib/server/observability/log';

const SETUP_TTL_MS = 72 * 60 * 60 * 1000; // 72h — same as /api/admin/users

const Body = z.object({ email: zEmail });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ parentUserId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;
    const schoolId = auth.user.schoolId;

    const { parentUserId } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message ?? 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const newEmail = parsed.data.email;

    // User is deliberately NOT tenant-scoped (see prisma.ts) — schoolId
    // must be checked explicitly, or staff could edit a parent account
    // belonging to a different school.
    const parentUser = await prisma.user.findUnique({
      where: { id: parentUserId },
      select: { id: true, role: true, schoolId: true, email: true, passwordHash: true, name: true },
    });
    if (!parentUser || parentUser.role !== 'PARENT' || parentUser.schoolId !== schoolId) {
      return NextResponse.json(
        { error: 'PARENT_NOT_FOUND', message: 'Parent account not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (newEmail !== parentUser.email) {
      const taken = await prisma.user.findUnique({
        where: { email: newEmail },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: 'EMAIL_TAKEN', message: 'This email address is already in use.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const setupNotYetCompleted = !parentUser.passwordHash;
    const token = setupNotYetCompleted ? generateSetupToken() : null;
    const expiresAt = new Date(Date.now() + SETUP_TTL_MS);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: parentUserId }, data: { email: newEmail } });
      if (setupNotYetCompleted && token) {
        // Invalidate any stale unused setup link (possibly already sent to
        // the mistyped address) before issuing a fresh one.
        await tx.verificationCode.updateMany({
          where: { userId: parentUserId, type: 'ACCOUNT_SETUP', usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.verificationCode.create({
          data: { userId: parentUserId, code: token, type: 'ACCOUNT_SETUP', expiresAt },
        });
      }
    });

    if (!setupNotYetCompleted) {
      return NextResponse.json(
        { email: newEmail, setupUrl: null },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const locale = await getRequestLocale();
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const setupUrl = `${appUrl}/account-setup?token=${token}`;
    const template = accountSetupEmail({
      setupUrl,
      ...(parentUser.name ? { name: parentUser.name } : {}),
      roleLabel: 'Parent',
      expiresAt: expiresAt.toISOString(),
      locale,
    });

    let emailStatus: 'SENT' | 'FAILED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let emailError: string | undefined;
    const queue = getEmailQueue();
    if (!queue) {
      emailError = "Service d'envoi d'e-mail non configuré";
      log.warn('parents.update-email: email queue unavailable', { userId: parentUserId });
    } else {
      const emailJobId = await queue.enqueue({
        to: newEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
      const sendResult = await queue.sendNow(emailJobId);
      emailStatus = sendResult.status === 'SENT' ? 'SENT' : 'FAILED';
      emailError = sendResult.lastError;
    }

    return NextResponse.json(
      { email: newEmail, emailStatus, ...(emailError ? { emailError } : {}), setupUrl },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

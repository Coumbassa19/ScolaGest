// GET  /api/students/[id]/parents — list the parent accounts linked to this
//      student (for the "Compte(s) parent" panel on the student page).
// POST /api/students/[id]/parents — grant a parent access to this student,
//      either by creating a brand-new PARENT login (mode NEW — mirrors
//      /api/admin/users' setup-link/email flow) or by linking an EXISTING
//      parent account (mode LINK_EXISTING — the common case for a sibling:
//      the parent already has a login from an older child, this just adds
//      another ParentStudent row so they see this child too).
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

const RELATIONS = ['PERE', 'MERE', 'TUTEUR'] as const;

const Body = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('NEW'),
    email: zEmail,
    name: z.string().trim().max(120).optional(),
    relation: z.enum(RELATIONS),
  }),
  z.object({
    mode: z.literal('LINK_EXISTING'),
    parentUserId: z.string(),
    relation: z.enum(RELATIONS),
  }),
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    const links = await prisma.parentStudent.findMany({
      where: { studentId: id },
      include: { parentUser: { select: { id: true, email: true, name: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ links }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;
    const schoolId = auth.user.schoolId;
    if (!schoolId) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'Your account is not linked to a school.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id: studentId } = await params;
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
    const data = parsed.data;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, schoolId: true },
    });
    if (!student) {
      return NextResponse.json(
        { error: 'STUDENT_NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (data.mode === 'LINK_EXISTING') {
      // User is deliberately NOT tenant-scoped (see prisma.ts) — the
      // schoolId match must be checked explicitly, or a parent account from
      // a different school could be linked to this one's student.
      const parentUser = await prisma.user.findUnique({
        where: { id: data.parentUserId },
        select: { id: true, role: true, schoolId: true },
      });
      if (!parentUser || parentUser.role !== 'PARENT' || parentUser.schoolId !== schoolId) {
        return NextResponse.json(
          { error: 'PARENT_NOT_FOUND', message: 'Parent account not found' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      // No `select` here on purpose — see the tuitionPlan comment in
      // /parent/page.tsx for why a narrower select on a tenant-scoped
      // findUnique silently breaks the ownership check.
      const existingLink = await prisma.parentStudent.findUnique({
        where: { parentUserId_studentId: { parentUserId: data.parentUserId, studentId } },
      });
      if (existingLink) {
        return NextResponse.json(
          { error: 'ALREADY_LINKED', message: 'This parent already has access to this student.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      const link = await prisma.parentStudent.create({
        data: {
          schoolId,
          parentUserId: data.parentUserId,
          studentId,
          relation: data.relation,
        },
        include: { parentUser: { select: { id: true, email: true, name: true, status: true } } },
      });
      return NextResponse.json(
        { link },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // mode === 'NEW'
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'EMAIL_TAKEN', message: 'This email address is already in use.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const token = generateSetupToken();
    const expiresAt = new Date(Date.now() + SETUP_TTL_MS);

    const { userId } = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          ...(data.name ? { name: data.name } : {}),
          role: 'PARENT',
          schoolId,
        },
        select: { id: true },
      });
      await tx.verificationCode.create({
        data: { userId: created.id, code: token, type: 'ACCOUNT_SETUP', expiresAt },
      });
      await tx.parentStudent.create({
        data: { schoolId, parentUserId: created.id, studentId, relation: data.relation },
      });
      return { userId: created.id };
    });

    // Outside the tx — same rationale as /api/admin/users: outbound HTTP has
    // no business holding a DB transaction open.
    const locale = await getRequestLocale();
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const setupUrl = `${appUrl}/account-setup?token=${token}`;
    const roleLabel = locale === 'en' ? 'Parent' : 'Parent';
    const template = accountSetupEmail({
      setupUrl,
      ...(data.name ? { name: data.name } : {}),
      roleLabel,
      expiresAt: expiresAt.toISOString(),
      locale,
    });

    let emailStatus: 'SENT' | 'FAILED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let emailError: string | undefined;
    const queue = getEmailQueue();
    if (!queue) {
      emailError = "Service d'envoi d'e-mail non configuré";
      log.warn('students.parents.create: email queue unavailable', { userId });
    } else {
      const emailJobId = await queue.enqueue({
        to: data.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
      const sendResult = await queue.sendNow(emailJobId);
      emailStatus = sendResult.status === 'SENT' ? 'SENT' : 'FAILED';
      emailError = sendResult.lastError;
    }

    const link = await prisma.parentStudent.findUnique({
      where: { parentUserId_studentId: { parentUserId: userId, studentId } },
      include: { parentUser: { select: { id: true, email: true, name: true, status: true } } },
    });

    return NextResponse.json(
      {
        link,
        emailStatus,
        ...(emailError ? { emailError } : {}),
        setupUrl,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

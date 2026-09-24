// ADMIN-01 — GET /api/admin/users (list with q + status + role filters,
// cursor pagination).
//
// Sequence (Phase 3 RESEARCH.md Pattern 1, "admin-read"):
//   makeRequestContext → withRequestContext →
//     requireAdmin('ADMIN') (D-ADMIN-03 — ADMIN suffices for PII reads) →
//     enforceAdminRateLimit(auth.admin.id) (D-ADMIN-05 — 100/min/userId) →
//     parse ?q ?status ?role ?cursor ?limit →
//     prisma.user.findMany(take=limit+1, orderBy createdAt DESC, id DESC) →
//     buildPage → return { items, nextCursor }
//
// PII whitelist: USER_SELECT excludes passwordHash / withdrawalPinHash /
// tokenVersion (T-03-02-02 — info-disclosure mitigation). The admin UI
// only needs identity + role + status + createdAt.
//
// Empty result → 200 { items: [], nextCursor: null } per D-LIST-05 — never 404.
//
// POST /api/admin/users — create a DIRECTION/TEACHER/ADMIN/SUPERADMIN staff
// account (src/app/settings/users/new). No password is set at creation —
// User.passwordHash starts NULL and an ACCOUNT_SETUP VerificationCode
// (long random token, see generateSetupToken()) is emailed immediately via
// the same getEmailQueue().sendNow() pattern the Messages feature uses, so
// the admin sees live Sent/Failed feedback rather than firing into a queue
// blind. Gated by requireSchoolAdmin: ADMIN/SUPERADMIN (platform) or a
// DIRECTION account (a school's own owner — always creates within its own
// schoolId, see requireSchoolAdmin). Role floor: DIRECTION/ADMIN can create
// DIRECTION/TEACHER/STAFF; only SUPERADMIN can create another ADMIN/
// SUPERADMIN (mirrors PATCH .../role's spirit — never mint a peer/superior).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf, generateSetupToken } from '@/lib/server/auth';
import { requireAdmin, requireSchoolAdmin } from '@/lib/server/middleware';
import { prisma, scopedPrisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { logAdminAction } from '@/lib/server/admin/audit';
import { zEmail } from '@/lib/server/zod-helpers';
import { MENU_KEYS } from '@/lib/server/permissions/menu-keys';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { accountSetupEmail } from '@/lib/server/auth/email-templates';
import { getRequestLocale } from '@/lib/server/request-locale';
import { log } from '@/lib/server/observability/log';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    const role = url.searchParams.get('role');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.UserWhereInput = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: USER_SELECT,
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(page, {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}

const SETUP_TTL_MS = 72 * 60 * 60 * 1000; // 72h — see plan's "Décisions techniques"

const STAFF_ROLE_LABEL: Record<string, { fr: string; en: string }> = {
  ADMIN: { fr: 'Administrateur', en: 'Administrator' },
  SUPERADMIN: { fr: 'Super-administrateur', en: 'Super-administrator' },
  DIRECTION: { fr: 'Direction', en: 'Direction' },
  TEACHER: { fr: 'Enseignant', en: 'Teacher' },
  STAFF: { fr: 'Personnel', en: 'Staff' },
};

const CreateBody = z.object({
  email: zEmail,
  name: z.string().trim().max(120).optional(),
  role: z.enum(['ADMIN', 'SUPERADMIN', 'DIRECTION', 'TEACHER', 'STAFF']),
  /** Required when role is TEACHER — links the login to an existing HR Teacher row. */
  teacherId: z.string().optional(),
  /** Required when role is STAFF — links the login to an existing HR Staff row. */
  staffId: z.string().optional(),
  /** Bonus menus beyond the role's core set (see menu-keys.ts TEACHER_CORE_MENUS / DIRECTION_CORE_MENUS / STAFF_CORE_MENUS). */
  enabledMenus: z.array(z.enum(MENU_KEYS)).optional(),
});

type CreateDiscriminator =
  | { kind: 'TEACHER_NOT_FOUND' }
  | { kind: 'TEACHER_ALREADY_LINKED' }
  | { kind: 'STAFF_NOT_FOUND' }
  | { kind: 'STAFF_ALREADY_LINKED' }
  | { kind: 'EMAIL_TAKEN' }
  | { kind: 'OK'; userId: string; token: string };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSchoolAdmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    if ((data.role === 'ADMIN' || data.role === 'SUPERADMIN') && auth.admin.role !== 'SUPERADMIN') {
      return NextResponse.json(
        {
          error: 'SUPERADMIN_REQUIRED',
          message: 'Only a SUPERADMIN can create another ADMIN or SUPERADMIN account.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (data.role === 'TEACHER' && !data.teacherId) {
      return NextResponse.json(
        {
          error: 'TEACHER_ID_REQUIRED',
          message: 'Select which teacher this login belongs to.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (data.role === 'STAFF' && !data.staffId) {
      return NextResponse.json(
        {
          error: 'STAFF_ID_REQUIRED',
          message: 'Select which staff member this login belongs to.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!auth.admin.schoolId) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'Your account is not linked to a school.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const schoolId = auth.admin.schoolId;
    const schoolPrisma = scopedPrisma(schoolId);

    const token = generateSetupToken();
    const expiresAt = new Date(Date.now() + SETUP_TTL_MS);

    const result: CreateDiscriminator = await schoolPrisma.$transaction(async (tx) => {
      if (data.role === 'TEACHER' && data.teacherId) {
        // select must include schoolId — the tenant-scope extension's
        // post-fetch ownership check reads it off the result to verify the
        // row belongs to this school (see UNIQUE_READ_OPS in prisma.ts); a
        // narrower select silently makes every row look cross-tenant.
        const teacher = await tx.teacher.findUnique({
          where: { id: data.teacherId },
          select: { id: true, schoolId: true },
        });
        if (!teacher) return { kind: 'TEACHER_NOT_FOUND' as const };

        const linked = await tx.user.findUnique({
          where: { teacherId: data.teacherId },
          select: { id: true },
        });
        if (linked) return { kind: 'TEACHER_ALREADY_LINKED' as const };
      }

      if (data.role === 'STAFF' && data.staffId) {
        // See the schoolId comment on the Teacher lookup above.
        const staffMember = await tx.staff.findUnique({
          where: { id: data.staffId },
          select: { id: true, schoolId: true },
        });
        if (!staffMember) return { kind: 'STAFF_NOT_FOUND' as const };

        const linked = await tx.user.findUnique({
          where: { staffId: data.staffId },
          select: { id: true },
        });
        if (linked) return { kind: 'STAFF_ALREADY_LINKED' as const };
      }

      const existing = await tx.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (existing) return { kind: 'EMAIL_TAKEN' as const };

      const created = await tx.user.create({
        data: {
          email: data.email,
          ...(data.name ? { name: data.name } : {}),
          role: data.role,
          schoolId,
          ...(data.role === 'TEACHER' && data.teacherId ? { teacherId: data.teacherId } : {}),
          ...(data.role === 'STAFF' && data.staffId ? { staffId: data.staffId } : {}),
          ...(data.enabledMenus ? { enabledMenus: data.enabledMenus } : {}),
        },
        select: { id: true },
      });

      await tx.verificationCode.create({
        data: { userId: created.id, code: token, type: 'ACCOUNT_SETUP', expiresAt },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'user.create',
        targetType: 'User',
        targetId: created.id,
        metadata: { role: data.role, email: data.email },
      });

      return { kind: 'OK' as const, userId: created.id, token };
    });

    if (result.kind === 'TEACHER_NOT_FOUND') {
      return NextResponse.json(
        { error: 'TEACHER_NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (result.kind === 'TEACHER_ALREADY_LINKED') {
      return NextResponse.json(
        { error: 'TEACHER_ALREADY_LINKED', message: 'This teacher already has a login account.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (result.kind === 'STAFF_NOT_FOUND') {
      return NextResponse.json(
        { error: 'STAFF_NOT_FOUND', message: 'Staff member not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (result.kind === 'STAFF_ALREADY_LINKED') {
      return NextResponse.json(
        {
          error: 'STAFF_ALREADY_LINKED',
          message: 'This staff member already has a login account.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (result.kind === 'EMAIL_TAKEN') {
      return NextResponse.json(
        { error: 'EMAIL_TAKEN', message: 'This email address is already in use.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Send the invite immediately (outside the tx — outbound HTTP has no
    // business holding a DB transaction open) so the admin gets live
    // Sent/Failed feedback, same pattern as sendSchoolMessage's sendNow().
    const locale = await getRequestLocale();
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const setupUrl = `${appUrl}/account-setup?token=${result.token}`;
    const roleLabel = STAFF_ROLE_LABEL[data.role]?.[locale === 'en' ? 'en' : 'fr'] ?? data.role;
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
      log.warn('admin user.create: email queue unavailable', { userId: result.userId });
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

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: USER_SELECT,
    });
    return NextResponse.json(
      {
        user,
        emailStatus,
        ...(emailError ? { emailError } : {}),
        // Always returned (not just on failure): the actor is the
        // ADMIN/SUPERADMIN who just authorized this account, so handing
        // back the same link the email carries isn't a new exposure — and
        // it's the only way to share access when the email can't be
        // delivered (e.g. Resend's sandbox mode only delivers to the
        // account owner's own address until a domain is verified).
        setupUrl,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

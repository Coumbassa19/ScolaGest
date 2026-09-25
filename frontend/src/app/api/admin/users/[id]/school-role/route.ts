// PATCH /api/admin/users/[id]/school-role — change an EXISTING DIRECTION/
// TEACHER/STAFF account's role, keeping the same login/email. Previously
// there was no way to do this at all: the only role-mutation endpoint
// (.../role) is SUPERADMIN-only and limited to USER/ADMIN/SUPERADMIN (the
// platform back-office roles) — it deliberately doesn't touch school roles.
// This is the school-admin-gated counterpart for promoting e.g. a STAFF
// account to DIRECTION, or moving a login between TEACHER/STAFF, without
// deleting and recreating the account (which isn't possible anyway — there
// is no user-delete endpoint, and a new account can't reuse an email
// that's still attached to the old one).
//
// TEACHER/STAFF roles are linked 1:1 to an HR row (Teacher.id/Staff.id via
// User.teacherId/staffId, unique) — same invariant as POST /api/admin/users.
// Switching INTO one of those roles requires picking an unlinked HR row;
// switching AWAY from one clears the now-stale FK so that HR row becomes
// linkable again. DIRECTION never links to an HR row.
//
// Sequence: makeRequestContext → withRequestContext → verifyCsrf →
//   requireSchoolAdmin → enforceAdminRateLimit → Zod parse →
//   prisma.$transaction(find → guard → re-link checks → update) →
//   logAdminAction (action: 'user.school_role_change').
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSchoolAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  role: z.enum(['DIRECTION', 'TEACHER', 'STAFF']),
  teacherId: z.string().optional(),
  staffId: z.string().optional(),
});

type Discriminator =
  | { kind: 'NOT_FOUND' }
  | { kind: 'UNRESTRICTED_ROLE' }
  | { kind: 'TEACHER_NOT_FOUND' }
  | { kind: 'TEACHER_ALREADY_LINKED' }
  | { kind: 'STAFF_NOT_FOUND' }
  | { kind: 'STAFF_ALREADY_LINKED' }
  | { kind: 'OK'; user: { id: string; role: string } };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSchoolAdmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const data = parsed.data;
    if (data.role === 'TEACHER' && !data.teacherId) {
      return NextResponse.json(
        { error: 'TEACHER_ID_REQUIRED', message: 'Select which teacher this login belongs to.' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (data.role === 'STAFF' && !data.staffId) {
      return NextResponse.json(
        { error: 'STAFF_ID_REQUIRED', message: 'Select which staff member this login belongs to.' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const result: Discriminator = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, schoolId: true },
      });
      if (!target || (auth.admin.role === 'DIRECTION' && target.schoolId !== auth.admin.schoolId)) {
        return { kind: 'NOT_FOUND' as const };
      }
      if (target.role === 'ADMIN' || target.role === 'SUPERADMIN') {
        return { kind: 'UNRESTRICTED_ROLE' as const };
      }

      if (data.role === 'TEACHER' && data.teacherId) {
        const teacher = await tx.teacher.findUnique({
          where: { id: data.teacherId },
          select: { id: true, schoolId: true },
        });
        if (!teacher || teacher.schoolId !== target.schoolId) {
          return { kind: 'TEACHER_NOT_FOUND' as const };
        }
        const linked = await tx.user.findUnique({
          where: { teacherId: data.teacherId },
          select: { id: true },
        });
        if (linked && linked.id !== target.id) {
          return { kind: 'TEACHER_ALREADY_LINKED' as const };
        }
      }
      if (data.role === 'STAFF' && data.staffId) {
        const staffMember = await tx.staff.findUnique({
          where: { id: data.staffId },
          select: { id: true, schoolId: true },
        });
        if (!staffMember || staffMember.schoolId !== target.schoolId) {
          return { kind: 'STAFF_NOT_FOUND' as const };
        }
        const linked = await tx.user.findUnique({
          where: { staffId: data.staffId },
          select: { id: true },
        });
        if (linked && linked.id !== target.id) {
          return { kind: 'STAFF_ALREADY_LINKED' as const };
        }
      }

      // Clear whichever FK no longer applies so the old HR row becomes
      // linkable again (e.g. promoting a STAFF login to DIRECTION frees
      // its staffId for a future, different login).
      const updateData: Prisma.UserUncheckedUpdateInput = {
        role: data.role,
        teacherId: data.role === 'TEACHER' ? (data.teacherId ?? null) : null,
        staffId: data.role === 'STAFF' ? (data.staffId ?? null) : null,
      };
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: { id: true, role: true },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'user.school_role_change',
        targetType: 'User',
        targetId: id,
        metadata: { from: target.role, to: data.role },
      });

      return { kind: 'OK' as const, user: updated };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'UNRESTRICTED_ROLE') {
      return NextResponse.json(
        {
          error: 'UNRESTRICTED_ROLE',
          message: 'ADMIN/SUPERADMIN accounts are managed via a different endpoint.',
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'TEACHER_NOT_FOUND') {
      return NextResponse.json(
        { error: 'TEACHER_NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'TEACHER_ALREADY_LINKED') {
      return NextResponse.json(
        { error: 'TEACHER_ALREADY_LINKED', message: 'This teacher already has a login account.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'STAFF_NOT_FOUND') {
      return NextResponse.json(
        { error: 'STAFF_NOT_FOUND', message: 'Staff member not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'STAFF_ALREADY_LINKED') {
      return NextResponse.json(
        {
          error: 'STAFF_ALREADY_LINKED',
          message: 'This staff member already has a login account.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      { user: result.user },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

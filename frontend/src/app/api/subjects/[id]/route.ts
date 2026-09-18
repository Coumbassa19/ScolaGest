// GET    /api/subjects/[id] — single subject detail (used by the edit page).
//        Plain requireStaff() — a TEACHER may view only their own assigned
//        subject (403 otherwise), matching GET /api/subjects's scoping.
// PATCH  /api/subjects/[id] — partial update of a subject's profile.
// DELETE /api/subjects/[id] — removes a subject. The schema cascades
//       Grade.subjectId (onDelete: Cascade) — deleting a subject would
//       silently wipe every grade recorded for it, which isn't safe for a
//       real school app. We refuse the delete (409) when grades exist
//       instead of relying on the cascade. ScheduleEntry.subjectId is
//       onDelete: SetNull (non-destructive — sessions just lose the subject
//       link), so that's allowed to happen automatically.
//       PATCH/DELETE require the 'subjects' menu AND are explicitly
//       blocked for TEACHER role (see POST /api/subjects for why).
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { zCuid } from '@/lib/server/zod-helpers';
import { syncSubjectTeacherAssignments } from '@/lib/server/permissions/teacher-scope';
import { requireSchoolId } from '@/lib/server/tenant/context';

const Body = z.object({
  nom: z.string().trim().min(1).max(100).optional(),
  code: z.string().trim().min(1).max(20).optional(),
  coefficient: z.number().int().min(1).max(10).optional(),
  teacherId: zCuid.optional().or(z.literal('')),
  classesText: z.string().trim().max(300).optional(),
  volumeHoraire: z.number().int().min(1).max(40).optional(),
  type: z.string().trim().max(60).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff();
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    const subject = await prisma.subject.findUnique({ where: { id }, include: { teacher: true } });
    if (!subject) {
      return NextResponse.json(
        { error: 'SUBJECT_NOT_FOUND', message: 'Matière introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (auth.user.role === 'TEACHER') {
      const owns = await prisma.teacherAssignment.findFirst({
        where: { teacherId: auth.user.teacherId ?? '', subjectId: id },
        select: { id: true },
      });
      if (!owns) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Not your subject' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }
    return NextResponse.json({ subject }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'subjects' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;
    const schoolId = requireSchoolId(auth.user.schoolId);
    if (auth.user.role === 'TEACHER') {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Teachers cannot create or edit subjects' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
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

    try {
      const { subject, unmatched } = await prisma.$transaction(async (tx) => {
        const updated = await tx.subject.update({
          where: { id },
          data: {
            ...(data.nom !== undefined ? { nom: data.nom } : {}),
            ...(data.code !== undefined ? { code: data.code.toUpperCase() } : {}),
            ...(data.coefficient !== undefined ? { coefficient: data.coefficient } : {}),
            ...(data.teacherId !== undefined ? { teacherId: data.teacherId || null } : {}),
            ...(data.classesText !== undefined ? { classesText: data.classesText || null } : {}),
            ...(data.volumeHoraire !== undefined ? { volumeHoraire: data.volumeHoraire } : {}),
            ...(data.type !== undefined ? { type: data.type || null } : {}),
          },
          include: { teacher: true },
        });
        // Keeps TeacherAssignment (the real TEACHER-scoping ground truth)
        // derived live from classesText — see syncSubjectTeacherAssignments.
        const sync = await syncSubjectTeacherAssignments(tx, schoolId, updated.id);
        return { subject: updated, unmatched: sync.unmatched };
      });
      return NextResponse.json(
        { subject, ...(unmatched.length > 0 ? { unmatchedClasses: unmatched } : {}) },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'SUBJECT_NOT_FOUND', message: 'Matière introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const isUniqueClash =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
      if (isUniqueClash) {
        return NextResponse.json(
          { error: 'SUBJECT_CODE_TAKEN', message: 'Ce code matière existe déjà' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'subjects' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;
    if (auth.user.role === 'TEACHER') {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Teachers cannot delete subjects' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;

    const subject = await prisma.subject.findUnique({ where: { id } });
    if (!subject) {
      return NextResponse.json(
        { error: 'SUBJECT_NOT_FOUND', message: 'Matière introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const gradeCount = await prisma.grade.count({ where: { subjectId: id } });
    if (gradeCount > 0) {
      return NextResponse.json(
        {
          error: 'SUBJECT_HAS_GRADES',
          message: `Impossible de supprimer : ${gradeCount} note(s) sont associées à cette matière.`,
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.subject.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}

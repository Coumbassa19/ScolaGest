// GET  /api/grades?classId=&periode= — list grades (with student + subject)
//      for a class/period — used by /grades and /bulletin.
// POST /api/grades — bulk-save grades for one class/subject/period/year (the
//      enter-grades form saves one row per student at once). Upserts on
//      the (studentId, subjectId, periode, anneeScolaire) unique constraint
//      so re-saving the same class/subject/period/year corrects rather than
//      duplicates, while keeping different years' grades separate.
//
// TEACHER-role scoping: a teacher may only read/write grades for a
// (class, subject) pair they're actually assigned to (TeacherAssignment).
// GET narrows rather than rejects when no classId/subjectId filter is
// given (so a broader query — e.g. by studentId only — still only returns
// what this teacher is allowed to see), but rejects an explicit classId
// outside their assignments. POST always rejects a (classId, subjectId)
// pair the teacher isn't assigned to — that's the hard boundary that
// survives a crafted request regardless of what the UI ever renders.
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
import { requireSchoolId } from '@/lib/server/tenant/context';
import { zCuid } from '@/lib/server/zod-helpers';
import { getTeacherClassIds, getTeacherSubjectIds, assertTeacherAssignment } from '@/lib/server/permissions/teacher-scope';

const Body = z.object({
  classId: zCuid,
  subjectId: zCuid,
  periode: z.enum(['T1', 'T2', 'T3']).default('T1'),
  anneeScolaire: z.string().trim().min(1).max(20).default('2024-2025'),
  entries: z
    .array(
      z.object({
        studentId: zCuid,
        valeur: z.number().int().min(0).max(20),
      }),
    )
    .min(1)
    .max(200),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'grades' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId') || undefined;
    const periode = searchParams.get('periode') || undefined;
    const studentId = searchParams.get('studentId') || undefined;
    const anneeScolaire = searchParams.get('anneeScolaire') || undefined;

    let teacherClassIds: string[] | undefined;
    let teacherSubjectIds: string[] | undefined;
    if (auth.user.role === 'TEACHER') {
      if (!auth.user.teacherId) {
        return NextResponse.json(
          { error: 'TEACHER_NOT_LINKED', message: 'No teacher record linked to this account' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      [teacherClassIds, teacherSubjectIds] = await Promise.all([
        getTeacherClassIds(prisma, auth.user.teacherId),
        getTeacherSubjectIds(prisma, auth.user.teacherId),
      ]);
      if (classId && !teacherClassIds.includes(classId)) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Not your class' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const grades = await prisma.grade.findMany({
      where: {
        ...(classId ? { classId } : teacherClassIds ? { classId: { in: teacherClassIds } } : {}),
        ...(periode ? { periode } : {}),
        ...(studentId ? { studentId } : {}),
        ...(anneeScolaire ? { anneeScolaire } : {}),
        ...(teacherSubjectIds ? { subjectId: { in: teacherSubjectIds } } : {}),
      },
      include: { student: true, subject: true },
      orderBy: [{ subject: { nom: 'asc' } }],
    });
    return NextResponse.json({ grades }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'grades' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

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
    const { classId, subjectId, periode, anneeScolaire, entries } = parsed.data;

    const [schoolClass, subject] = await Promise.all([
      prisma.schoolClass.findUnique({ where: { id: classId } }),
      prisma.subject.findUnique({ where: { id: subjectId } }),
    ]);
    if (!schoolClass || !subject) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Classe ou matière introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (auth.user.role === 'TEACHER') {
      if (!auth.user.teacherId) {
        return NextResponse.json(
          { error: 'TEACHER_NOT_LINKED', message: 'No teacher record linked to this account' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const allowed = await assertTeacherAssignment(prisma, auth.user.teacherId, classId, subjectId);
      if (!allowed) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'You are not assigned to this class/subject' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const grades = await prisma.$transaction(
      entries.map((entry) =>
        prisma.grade.upsert({
          where: {
            studentId_subjectId_periode_anneeScolaire: {
              studentId: entry.studentId,
              subjectId,
              periode,
              anneeScolaire,
            },
          },
          update: { valeur: entry.valeur, classId },
          create: {
            schoolId: requireSchoolId(auth.user.schoolId),
            studentId: entry.studentId,
            subjectId,
            classId,
            periode,
            anneeScolaire,
            valeur: entry.valeur,
          },
        }),
      ),
    );

    return NextResponse.json(
      { grades, count: grades.length },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

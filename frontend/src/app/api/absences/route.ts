// GET  /api/absences?classId=&date=YYYY-MM-DD — the daily roll-call register
//      for one class: every enrolled student plus their recorded status for
//      that date (null when not yet taken), plus a `recent` list of the
//      last 7 days' non-PRESENT entries for that class (a quick "who's been
//      missing lately" glance without a separate history page). Requires
//      the 'absences' menu. A TEACHER may only take/view attendance for a
//      class they actually teach (TeacherAssignment, via getTeacherClassIds
//      — same ground truth GET /api/grades and GET /api/schedule use).
// POST /api/absences — bulk-save one day's register for one class (one
//      upsert per student, keyed on the (studentId, date) unique
//      constraint — resubmitting the same day corrects rather than
//      duplicates, same pattern as POST /api/grades). Deliberately records
//      EVERY student's status, not just exceptions — see the Absence model
//      comment in schema.prisma for why.
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
import { getTeacherClassIds } from '@/lib/server/permissions/teacher-scope';
import { requireSchoolId } from '@/lib/server/tenant/context';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

function parseDay(dateStr: string): Date {
  // Day granularity, always midnight UTC — avoids the row for "2026-09-16"
  // landing on a different calendar day depending on server timezone.
  return new Date(`${dateStr}T00:00:00.000Z`);
}

const Body = z.object({
  classId: zCuid,
  date: z.string().regex(DATE_RE, 'Format attendu AAAA-MM-JJ'),
  entries: z
    .array(
      z.object({
        studentId: zCuid,
        status: z.enum(STATUSES),
        reason: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'absences' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId') ?? '';
    const dateParam = searchParams.get('date') ?? '';
    if (!zCuid.safeParse(classId).success || !DATE_RE.test(dateParam)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'classId et date (AAAA-MM-JJ) sont obligatoires' },
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
      const classIds = await getTeacherClassIds(prisma, auth.user.teacherId);
      if (!classIds.includes(classId)) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Not your class' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const day = parseDay(dateParam);
    const sevenDaysAgo = new Date(day.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [roster, dayRecords, recentRecords] = await Promise.all([
      prisma.student.findMany({
        where: { classId },
        select: { id: true, nom: true, prenom: true, matricule: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
      prisma.absence.findMany({
        where: { classId, date: day },
        select: { studentId: true, status: true, reason: true },
      }),
      prisma.absence.findMany({
        where: {
          classId,
          date: { gte: sevenDaysAgo, lt: day },
          status: { not: 'PRESENT' },
        },
        include: { student: { select: { nom: true, prenom: true } } },
        orderBy: { date: 'desc' },
      }),
    ]);

    const byStudent = new Map(dayRecords.map((r) => [r.studentId, r]));
    const students = roster.map((s) => ({
      id: s.id,
      nom: s.nom,
      prenom: s.prenom,
      matricule: s.matricule,
      status: byStudent.get(s.id)?.status ?? null,
      reason: byStudent.get(s.id)?.reason ?? null,
    }));

    const recent = recentRecords.map((r) => ({
      studentId: r.studentId,
      studentNom: r.student.nom,
      studentPrenom: r.student.prenom,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      reason: r.reason,
    }));

    return NextResponse.json({ students, recent }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'absences' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { classId, date, entries } = parsed.data;

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: classId } });
    if (!schoolClass) {
      return NextResponse.json(
        { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
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
      const classIds = await getTeacherClassIds(prisma, auth.user.teacherId);
      if (!classIds.includes(classId)) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Not your class' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const day = parseDay(date);
    const saved = await prisma.$transaction(
      entries.map((entry) =>
        prisma.absence.upsert({
          where: { studentId_date: { studentId: entry.studentId, date: day } },
          update: {
            classId,
            status: entry.status,
            reason: entry.reason ?? null,
            recordedById: auth.user.sub,
          },
          create: {
            schoolId: requireSchoolId(auth.user.schoolId),
            studentId: entry.studentId,
            classId,
            date: day,
            status: entry.status,
            reason: entry.reason ?? null,
            recordedById: auth.user.sub,
          },
        }),
      ),
    );

    return NextResponse.json(
      { saved: saved.length },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

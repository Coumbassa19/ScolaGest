// GET  /api/teacher-absences?teacherId= — every recorded absence day for
//      one teacher, most recent first. Used by the "Absences" section on
//      the teacher detail page.
// POST /api/teacher-absences — record a teacher as absent on one day
//      (upsert, keyed on the (teacherId, date) unique constraint —
//      resubmitting the same day corrects the reason rather than
//      duplicating, same pattern as POST /api/absences for students).
//      Teachers are paid by the hour according to their emploi du temps
//      (see Comptabilité > Paiement des enseignants), so a recorded
//      absence subtracts that day's scheduled hours (same weekday's
//      ScheduleEntry rows) from the auto-calculated monthly pay.
// Gated to the 'teachers' menu — same HR-record concern as creating/
// editing a teacher.
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
import { requireSchoolId } from '@/lib/server/tenant/context';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(dateStr: string): Date {
  // Day granularity, always midnight UTC — same convention as Absence
  // (student), so "2026-09-16" lands on the same calendar day regardless
  // of server timezone.
  return new Date(`${dateStr}T00:00:00.000Z`);
}

const Body = z.object({
  teacherId: zCuid,
  date: z.string().regex(DATE_RE, 'Format attendu AAAA-MM-JJ'),
  reason: z.string().trim().max(300).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'teachers' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get('teacherId') ?? '';
    if (!zCuid.safeParse(teacherId).success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'teacherId est obligatoire' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const absences = await prisma.teacherAbsence.findMany({
      where: { teacherId },
      orderBy: { date: 'desc' },
      take: 100,
    });

    return NextResponse.json(
      {
        absences: absences.map((a) => ({
          id: a.id,
          date: a.date.toISOString().slice(0, 10),
          reason: a.reason,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'teachers' });
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
    const { teacherId, date, reason } = parsed.data;

    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      return NextResponse.json(
        { error: 'TEACHER_NOT_FOUND', message: 'Enseignant introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const day = parseDay(date);
    const absence = await prisma.teacherAbsence.upsert({
      where: { teacherId_date: { teacherId, date: day } },
      update: { reason: reason ?? null, recordedById: auth.user.sub },
      create: {
        schoolId: requireSchoolId(auth.user.schoolId),
        teacherId,
        date: day,
        reason: reason ?? null,
        recordedById: auth.user.sub,
      },
    });

    return NextResponse.json(
      { absence: { id: absence.id, date, reason: absence.reason } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

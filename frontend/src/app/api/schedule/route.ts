// GET  /api/schedule?classId= — list schedule entries (with class/subject/
//      teacher) — used by /schedule. Gated to the 'schedule' menu. A
//      TEACHER additionally only ever sees their own sessions (filtered by
//      ScheduleEntry.teacherId) — the weekly timetable otherwise shows
//      every other teacher's sessions too, which isn't this teacher's
//      business to see (mirrors the TEACHER scoping style in
//      GET /api/grades).
// POST /api/schedule — create a schedule entry (class, subject, teacher,
//      day, start/end time). Admin/direction only — same TEACHER block as
//      PATCH/DELETE /api/schedule/[id], so a teacher can never create a
//      slot for a class/colleague that isn't theirs to manage.
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

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const Body = z.object({
  classId: zCuid,
  subjectId: zCuid.optional().or(z.literal('')),
  teacherId: zCuid.optional().or(z.literal('')),
  jour: z.enum(JOURS),
  heureDebut: z.string().regex(TIME_RE, 'Format attendu HH:MM'),
  heureFin: z.string().regex(TIME_RE, 'Format attendu HH:MM'),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'schedule' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId') || undefined;

    if (auth.user.role === 'TEACHER' && !auth.user.teacherId) {
      return NextResponse.json(
        { error: 'TEACHER_NOT_LINKED', message: 'No teacher record linked to this account' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const entries = await prisma.scheduleEntry.findMany({
      where: {
        ...(classId ? { classId } : {}),
        ...(auth.user.role === 'TEACHER' ? { teacherId: auth.user.teacherId ?? '' } : {}),
      },
      include: { schoolClass: true, subject: true, teacher: true },
      orderBy: [{ heureDebut: 'asc' }],
    });
    return NextResponse.json({ entries }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'schedule' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;
    if (auth.user.role === 'TEACHER') {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Teachers cannot create schedule entries' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

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
    const entry = await prisma.scheduleEntry.create({
      data: {
        schoolId: requireSchoolId(auth.user.schoolId),
        classId: data.classId,
        ...(data.subjectId ? { subjectId: data.subjectId } : {}),
        ...(data.teacherId ? { teacherId: data.teacherId } : {}),
        jour: data.jour,
        heureDebut: data.heureDebut,
        heureFin: data.heureFin,
      },
      include: { schoolClass: true, subject: true, teacher: true },
    });
    return NextResponse.json(
      { entry },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

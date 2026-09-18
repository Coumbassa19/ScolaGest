// GET    /api/schedule/[id] — single schedule entry (used by the edit page).
//        A TEACHER may view only their own slot (403 otherwise), matching
//        GET /api/schedule's list scoping.
// PATCH  /api/schedule/[id] — partial update (class, subject, teacher, day,
//        start/end time). Admin/direction only — editing timetable
//        configuration isn't a "manage my own slot" teacher feature, so
//        TEACHER is blocked outright here (same call as subjects PATCH).
// DELETE /api/schedule/[id] — removes a schedule entry. Same TEACHER block
//        as PATCH.
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

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const Body = z.object({
  classId: zCuid.optional(),
  subjectId: zCuid.optional().or(z.literal('')),
  teacherId: zCuid.optional().or(z.literal('')),
  jour: z.enum(JOURS).optional(),
  heureDebut: z.string().regex(TIME_RE, 'Format attendu HH:MM').optional(),
  heureFin: z.string().regex(TIME_RE, 'Format attendu HH:MM').optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'schedule' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    const entry = await prisma.scheduleEntry.findUnique({
      where: { id },
      include: { schoolClass: true, subject: true, teacher: true },
    });
    if (!entry) {
      return NextResponse.json(
        { error: 'ENTRY_NOT_FOUND', message: 'Créneau introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (auth.user.role === 'TEACHER' && entry.teacherId !== auth.user.teacherId) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Not your schedule entry' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json({ entry }, { headers: { 'x-request-id': ctx.requestId } });
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

    const auth = await requireStaff({ menuKey: 'schedule' });
    if (auth instanceof NextResponse) return auth;
    if (auth.user.role === 'TEACHER') {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Teachers cannot edit schedule entries' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const prisma = auth.user.prisma;

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
      const entry = await prisma.scheduleEntry.update({
        where: { id },
        data: {
          ...(data.classId !== undefined ? { classId: data.classId } : {}),
          ...(data.subjectId !== undefined ? { subjectId: data.subjectId || null } : {}),
          ...(data.teacherId !== undefined ? { teacherId: data.teacherId || null } : {}),
          ...(data.jour !== undefined ? { jour: data.jour } : {}),
          ...(data.heureDebut !== undefined ? { heureDebut: data.heureDebut } : {}),
          ...(data.heureFin !== undefined ? { heureFin: data.heureFin } : {}),
        },
        include: { schoolClass: true, subject: true, teacher: true },
      });
      return NextResponse.json({ entry }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'ENTRY_NOT_FOUND', message: 'Créneau introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
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

    const auth = await requireStaff({ menuKey: 'schedule' });
    if (auth instanceof NextResponse) return auth;
    if (auth.user.role === 'TEACHER') {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Teachers cannot delete schedule entries' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const prisma = auth.user.prisma;

    const { id } = await params;
    try {
      await prisma.scheduleEntry.delete({ where: { id } });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'ENTRY_NOT_FOUND', message: 'Créneau introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

// GET  /api/subjects — list subjects (with teacher) — used by /subjects,
//      enter-grades, and schedule dropdowns. Gated with a plain
//      requireStaff() (no menuKey) since it's shared infrastructure, like
//      /api/students — but a TEACHER only ever sees the subjects actually
//      assigned to them (TeacherAssignment), never the full staff roster.
// POST /api/subjects — create a subject (add-subject form). Gated to the
//      'subjects' menu AND explicitly blocked for TEACHER role even though
//      'subjects' is one of their always-on core menus (they need to SEE
//      their subjects to enter grades, but editing subject configuration —
//      coefficient, volume horaire — stays an admin/direction action).
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
import { syncSubjectTeacherAssignments } from '@/lib/server/permissions/teacher-scope';

const Body = z.object({
  nom: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(20),
  coefficient: z.number().int().min(1).max(10).default(1),
  teacherId: zCuid.optional().or(z.literal('')),
  classesText: z.string().trim().max(300).optional(),
  volumeHoraire: z.number().int().min(1).max(40).default(1),
  type: z.string().trim().max(60).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff();
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    if (auth.user.role === 'TEACHER' && !auth.user.teacherId) {
      return NextResponse.json(
        { error: 'TEACHER_NOT_LINKED', message: 'No teacher record linked to this account' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subjects = await prisma.subject.findMany({
      where:
        auth.user.role === 'TEACHER'
          ? { teacherAssignments: { some: { teacherId: auth.user.teacherId! } } }
          : {},
      include: { teacher: true },
      orderBy: { nom: 'asc' },
    });
    return NextResponse.json({ subjects }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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
        const created = await tx.subject.create({
          data: {
            schoolId,
            nom: data.nom,
            code: data.code.toUpperCase(),
            coefficient: data.coefficient,
            ...(data.teacherId ? { teacherId: data.teacherId } : {}),
            ...(data.classesText ? { classesText: data.classesText } : {}),
            volumeHoraire: data.volumeHoraire,
            ...(data.type ? { type: data.type } : {}),
          },
          include: { teacher: true },
        });
        // Keeps TeacherAssignment (the real TEACHER-scoping ground truth)
        // derived live from classesText — see syncSubjectTeacherAssignments.
        const sync = await syncSubjectTeacherAssignments(tx, schoolId, created.id);
        return { subject: created, unmatched: sync.unmatched };
      });
      return NextResponse.json(
        { subject, ...(unmatched.length > 0 ? { unmatchedClasses: unmatched } : {}) },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
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

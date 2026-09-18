// GET /api/bulletin-remarks?studentId=&periode= — fetch the saved
//     "Observations du Conseil" text for one student/term, if any.
// PUT /api/bulletin-remarks — create or update it (one row per
//     student+periode, enforced by the @@unique constraint).
// Both gated to the 'grades' menu — bulletin remarks are part of the
// bulletin/grades workflow.
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

const Body = z.object({
  studentId: zCuid,
  periode: z.enum(['T1', 'T2', 'T3']),
  observation: z.string().trim().max(2000),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'grades' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') ?? '';
    const periode = searchParams.get('periode') ?? '';
    if (!studentId || !periode) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'studentId et periode sont requis' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const remark = await prisma.bulletinRemark.findUnique({
      where: { studentId_periode: { studentId, periode } },
    });
    return NextResponse.json(
      { observation: remark?.observation ?? null },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
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
    const { studentId, periode, observation } = parsed.data;

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      return NextResponse.json(
        { error: 'STUDENT_NOT_FOUND', message: 'Élève introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const remark = await prisma.bulletinRemark.upsert({
      where: { studentId_periode: { studentId, periode } },
      create: { schoolId: requireSchoolId(auth.user.schoolId), studentId, periode, observation },
      update: { observation },
    });
    return NextResponse.json({ remark }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

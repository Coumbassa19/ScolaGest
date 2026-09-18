// GET  /api/classes — list all school classes. Despite the name, nothing
//      else in the app actually fetches this route today (add-student,
//      enter-grades, schedule, etc. all load their class dropdowns via a
//      direct prisma query in their own server component) — so unlike
//      GET /api/students, this isn't proven shared cross-menu
//      infrastructure, and is gated to the 'students' menu like everything
//      else here rather than left unscoped on a guess.
// POST /api/classes — create a class (e.g. "6ème A"). Also 'students' menu.
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

const Body = z.object({
  name: z.string().trim().min(1).max(50),
  level: z.number().int().min(0).max(20).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const classes = await prisma.schoolClass.findMany({
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
    });
    return NextResponse.json({ classes }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'students' });
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
    const schoolClass = await prisma.schoolClass.create({
      data: {
        schoolId: requireSchoolId(auth.user.schoolId),
        name: parsed.data.name,
        level: parsed.data.level ?? 0,
      },
    });
    return NextResponse.json(
      { class: schoolClass },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

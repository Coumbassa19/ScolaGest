// GET  /api/cycles — list all school cycles (Primaire/Secondaire/Universitaire
//      by default, editable/extendable per school). Ordered by `order` then
//      `name` so the dropdown/list always shows the school's chosen sequence.
// POST /api/cycles — create a cycle (name + grading scale "noté sur").
//      Gated to the 'students' menu, same as classes (managing cycles is
//      roster/grading-structure administration, not a separate section).
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
  noteMax: z.number().int().min(1).max(100),
  order: z.number().int().min(0).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const cycles = await prisma.cycle.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ cycles }, { headers: { 'x-request-id': ctx.requestId } });
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

    try {
      const cycle = await prisma.cycle.create({
        data: {
          schoolId: requireSchoolId(auth.user.schoolId),
          name: parsed.data.name,
          noteMax: parsed.data.noteMax,
          order: parsed.data.order ?? 0,
        },
      });
      return NextResponse.json(
        { cycle },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : null;
      if (code === 'P2002') {
        return NextResponse.json(
          { error: 'CYCLE_ALREADY_EXISTS', message: 'Un cycle porte déjà ce nom' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

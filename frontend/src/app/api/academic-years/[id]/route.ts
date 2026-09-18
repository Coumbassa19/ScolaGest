// PATCH /api/academic-years/[id] — switch the "current" academic year.
// Body: `{ isCurrent: true }`. Unsets every other row's `isCurrent` flag in
// the same transaction so exactly one stays current. Gated to the
// 'settings' menu, same as POST /api/academic-years — this is an
// admin/settings-level action, not shared lookup data.
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

const Body = z.object({
  isCurrent: z.literal(true),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'settings' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.academicYear.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'YEAR_NOT_FOUND', message: 'Année scolaire introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const year = await prisma.$transaction(
      async (tx) => {
        await tx.academicYear.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        });
        return tx.academicYear.update({ where: { id }, data: { isCurrent: true } });
      },
      // Local dev shares a small Neon connection pool (see .env.local); the
      // default 2s maxWait is too eager for a possibly-busy shared pool.
      { maxWait: 10_000, timeout: 15_000 },
    );

    return NextResponse.json({ year }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

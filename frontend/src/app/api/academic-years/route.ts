// GET  /api/academic-years — list all academic years (used to populate the
//      "Année scolaire" dropdowns on add-student / reregister-student, and
//      the Settings > Calendrier académique control). Deliberately gated
//      with a plain requireStaff() (no menuKey) rather than
//      menuKey:'settings' — it's shared lookup infrastructure the
//      students/grades/accounting menus also depend on for their year
//      dropdowns, so it only requires SOME staff session, not the
//      'settings' menu specifically.
// POST /api/academic-years — create a new academic year (e.g. "2026-2027").
//      `setCurrent: true` also switches the "current" flag to this one
//      (unsets every other row in the same transaction) — this is the
//      common case when a school moves to a new year. Gated to the
//      'settings' menu — managing the list of school years is an
//      admin/settings-level action, unlike the read-only dropdown data above.
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
  label: z
    .string()
    .trim()
    .min(4)
    .max(20)
    .regex(/^\d{4}-\d{4}$/, 'Format attendu : AAAA-AAAA (ex. 2026-2027)'),
  setCurrent: z.boolean().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff();
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const years = await prisma.academicYear.findMany({ orderBy: { label: 'desc' } });
    return NextResponse.json({ years }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'settings' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message ?? 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { label, setCurrent } = parsed.data;

    try {
      const year = await prisma.$transaction(
        async (tx) => {
          if (setCurrent) {
            await tx.academicYear.updateMany({
              where: { isCurrent: true },
              data: { isCurrent: false },
            });
          }
          return tx.academicYear.create({
            data: {
              schoolId: requireSchoolId(auth.user.schoolId),
              label,
              isCurrent: Boolean(setCurrent),
            },
          });
        },
        // Local dev shares a small Neon connection pool (see .env.local); the
        // default 2s maxWait is too eager for a possibly-busy shared pool.
        { maxWait: 10_000, timeout: 15_000 },
      );
      return NextResponse.json(
        { year },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      const isUniqueClash =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
      if (isUniqueClash) {
        return NextResponse.json(
          { error: 'YEAR_ALREADY_EXISTS', message: 'Cette année scolaire existe déjà' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

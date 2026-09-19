// PATCH /api/academic-years/[id] — switch the "current" academic year, and/or
// set that year's trimestre (term) date ranges.
// Body: `{ isCurrent: true }` to switch — unsets every other row's
// `isCurrent` flag in the same transaction so exactly one stays current.
// Body: `{ term1Start, term1End, term2Start, term2End, term3Start, term3End }`
// (each an "YYYY-MM-DD" string or null) to set/clear a trimestre's date
// range — only the provided keys change. The two shapes are mutually
// exclusive in practice (the UI never sends both at once) but nothing stops
// combining them. Gated to the 'settings' menu, same as POST
// /api/academic-years — this is an admin/settings-level action, not shared
// lookup data.
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

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
  .nullable()
  .optional();

const Body = z
  .object({
    isCurrent: z.literal(true).optional(),
    term1Start: dateField,
    term1End: dateField,
    term2Start: dateField,
    term2End: dateField,
    term3Start: dateField,
    term3End: dateField,
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Empty body' });

const TERM_DATE_KEYS = [
  'term1Start',
  'term1End',
  'term2Start',
  'term2End',
  'term3Start',
  'term3End',
] as const;

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

    if (parsed.data.isCurrent) {
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
    }

    const data: Record<string, Date | null> = {};
    for (const key of TERM_DATE_KEYS) {
      const value = parsed.data[key];
      if (value === undefined) continue;
      data[key] = value === null ? null : new Date(`${value}T00:00:00.000Z`);
    }

    const year = await prisma.academicYear.update({ where: { id }, data });
    return NextResponse.json({ year }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

// POST /api/accounting/tuition-plans — set (create or update) the annual
//      tuition amount due for one class, for one school year. Real schools
//      price tuition per grade level, not a single school-wide flat fee, so
//      this is keyed on (classId, anneeScolaire) — see TuitionPlan in
//      schema.prisma. Gated to the 'accounting' menu (plain menu-key check
//      — see menu-keys.ts for the admin's bonus-menu-for-teachers feature).
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
  classId: zCuid,
  anneeScolaire: z.string().trim().min(1).max(20),
  montantAnnuel: z.number().int().nonnegative(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'accounting' });
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
    const { classId, anneeScolaire, montantAnnuel } = parsed.data;

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: classId } });
    if (!schoolClass) {
      return NextResponse.json(
        { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const plan = await prisma.tuitionPlan.upsert({
      where: { classId_anneeScolaire: { classId, anneeScolaire } },
      create: { schoolId: requireSchoolId(auth.user.schoolId), classId, anneeScolaire, montantAnnuel },
      update: { montantAnnuel },
    });
    return NextResponse.json({ plan }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

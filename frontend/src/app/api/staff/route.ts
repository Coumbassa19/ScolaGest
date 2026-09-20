// POST /api/staff — create a personnel record (Comptabilité > Paiement des
//      personnels). Unlike Teacher, there is no separate "Gestion du
//      personnel" section — staff are added directly from the payment page,
//      so this route is gated to the same 'accounting' menu, not 'teachers'.
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
  nom: z.string().trim().min(1).max(80),
  prenom: z.string().trim().min(1).max(80),
  poste: z.string().trim().min(1).max(80),
  telephone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  salaireMensuel: z.number().int().nonnegative(),
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
          message: parsed.error.issues[0]?.message ?? 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;
    const staff = await prisma.staff.create({
      data: {
        schoolId: requireSchoolId(auth.user.schoolId),
        nom: data.nom,
        prenom: data.prenom,
        poste: data.poste,
        ...(data.telephone ? { telephone: data.telephone } : {}),
        ...(data.email ? { email: data.email } : {}),
        salaireMensuel: data.salaireMensuel,
      },
    });
    return NextResponse.json(
      { staff },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

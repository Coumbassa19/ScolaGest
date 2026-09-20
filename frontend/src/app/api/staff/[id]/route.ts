// PATCH  /api/staff/[id] — partial update of a personnel record (used by the
//        inline-editable "Salaire mensuel" cell on Comptabilité > Paiement
//        des personnels).
// DELETE /api/staff/[id] — removes a personnel record. StaffPayment.staffId
//        uses onDelete: Cascade, so this also removes their payment history
//        — appropriate here since, unlike a teacher, a Staff row with no
//        payment history is almost certainly a mistaken entry being
//        corrected, not a real employee record to preserve.
//        Both gated to the same 'accounting' menu as their creation (see
//        POST /api/staff).
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
  nom: z.string().trim().min(1).max(80).optional(),
  prenom: z.string().trim().min(1).max(80).optional(),
  poste: z.string().trim().min(1).max(80).optional(),
  telephone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  salaireMensuel: z.number().int().nonnegative().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'accounting' });
    if (auth instanceof NextResponse) return auth;
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
      const staff = await prisma.staff.update({
        where: { id },
        data: {
          ...(data.nom !== undefined ? { nom: data.nom } : {}),
          ...(data.prenom !== undefined ? { prenom: data.prenom } : {}),
          ...(data.poste !== undefined ? { poste: data.poste } : {}),
          ...(data.telephone !== undefined ? { telephone: data.telephone || null } : {}),
          ...(data.email !== undefined ? { email: data.email || null } : {}),
          ...(data.salaireMensuel !== undefined ? { salaireMensuel: data.salaireMensuel } : {}),
        },
      });
      return NextResponse.json({ staff }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'STAFF_NOT_FOUND', message: 'Membre du personnel introuvable' },
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

    const auth = await requireStaff({ menuKey: 'accounting' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    try {
      await prisma.staff.delete({ where: { id } });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'STAFF_NOT_FOUND', message: 'Membre du personnel introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

// PATCH  /api/accounting/salary-advances/[id] — correct an advance, or
//        toggle its statut (EN_COURS ↔ REMBOURSEE). Marking an advance
//        repaid is always a manual admin action — see the model comment in
//        schema.prisma for why it isn't automatic on payment.
// DELETE /api/accounting/salary-advances/[id] — void a mistaken advance
//        record. Both gated to the 'accounting' menu, same as creation.
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
  montant: z.number().int().positive().optional(),
  date: z.string().trim().optional(),
  motif: z.string().trim().max(300).optional(),
  periodeAAffecter: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM')
    .optional(),
  statut: z.enum(['EN_COURS', 'REMBOURSEE']).optional(),
  moyenPaiement: z.enum(['ORANGE_MONEY', 'ESPECES', 'VIREMENT']).optional(),
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
          message: parsed.error.issues[0]?.message ?? 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    let date: Date | undefined;
    if (data.date) {
      date = new Date(data.date);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Date invalide' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    try {
      const advance = await prisma.salaryAdvance.update({
        where: { id },
        data: {
          ...(data.montant !== undefined ? { montant: data.montant } : {}),
          ...(date ? { date } : {}),
          ...(data.motif !== undefined ? { motif: data.motif || null } : {}),
          ...(data.periodeAAffecter !== undefined
            ? { periodeAAffecter: data.periodeAAffecter }
            : {}),
          ...(data.statut !== undefined ? { statut: data.statut } : {}),
          ...(data.moyenPaiement !== undefined ? { moyenPaiement: data.moyenPaiement } : {}),
        },
        include: { teacher: true, staff: true },
      });
      return NextResponse.json({ advance }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'ADVANCE_NOT_FOUND', message: 'Avance introuvable' },
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
      await prisma.salaryAdvance.delete({ where: { id } });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'ADVANCE_NOT_FOUND', message: 'Avance introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

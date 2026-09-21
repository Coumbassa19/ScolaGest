// PATCH  /api/accounting/tuition/[id] — correct a "frais de scolarité"
//        installment payment (student, échéance, montant, moyen, date).
// DELETE /api/accounting/tuition/[id] — void a mistaken scolarité
//        installment payment. Both require the 'accounting' menu — plain
//        menu-key gating, no TEACHER-role hardcode (see menu-keys.ts for
//        the admin's bonus-menu-for-teachers feature).
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
import { zCuid } from '@/lib/server/zod-helpers';

const Body = z.object({
  studentId: zCuid.optional(),
  periode: z.enum(['T1', 'T2', 'T3', 'ANNUEL']).optional(),
  montant: z.number().int().positive().optional(),
  moyenPaiement: z.enum(['ORANGE_MONEY', 'ESPECES', 'VIREMENT']).optional(),
  date: z.string().trim().optional(),
});

const PERIODE_LABEL: Record<string, string> = {
  T1: '1ère tranche',
  T2: '2ème tranche',
  T3: '3ème tranche',
  ANNUEL: 'Annuel',
};

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

    const existing = await prisma.revenuePayment.findUnique({ where: { id } });
    if (!existing || existing.categorie !== 'SCOLARITE') {
      return NextResponse.json(
        { error: 'PAYMENT_NOT_FOUND', message: 'Paiement introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

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

    const targetStudentId = data.studentId ?? existing.studentId;
    if (targetStudentId) {
      const student = await prisma.student.findUnique({ where: { id: targetStudentId } });
      if (!student) {
        return NextResponse.json(
          { error: 'STUDENT_NOT_FOUND', message: 'Élève introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const periode = data.periode ?? existing.periode;
    const source = `Scolarité — ${periode ? PERIODE_LABEL[periode] : ''} (${existing.anneeScolaire})`;

    const payment = await prisma.revenuePayment.update({
      where: { id },
      data: {
        ...(data.studentId !== undefined ? { studentId: data.studentId } : {}),
        ...(data.periode !== undefined ? { periode: data.periode } : {}),
        ...(data.montant !== undefined ? { montant: data.montant } : {}),
        ...(data.moyenPaiement !== undefined ? { moyenPaiement: data.moyenPaiement } : {}),
        ...(date ? { date } : {}),
        source,
      },
      include: { student: { include: { schoolClass: true } } },
    });

    return NextResponse.json({ payment }, { headers: { 'x-request-id': ctx.requestId } });
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
    const existing = await prisma.revenuePayment.findUnique({ where: { id } });
    if (!existing || existing.categorie !== 'SCOLARITE') {
      return NextResponse.json(
        { error: 'PAYMENT_NOT_FOUND', message: 'Paiement introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    await prisma.revenuePayment.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}

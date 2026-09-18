// PATCH  /api/accounting/teacher-payments/[id] — correct a salary payment
//        (teacher, pay period, montant, moyen). Still guarded by the
//        @@unique([teacherId, periode]) constraint, so moving a payment
//        onto a teacher+month that's already paid is rejected with 409.
// DELETE /api/accounting/teacher-payments/[id] — void a mistaken salary
//        payment record. Both require the 'accounting' menu — plain
//        menu-key gating, no TEACHER-role hardcode (see menu-keys.ts).
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
  teacherId: zCuid.optional(),
  periode: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM')
    .optional(),
  montant: z.number().int().positive().optional(),
  moyenPaiement: z.enum(['WAVE', 'ORANGE_MONEY', 'ESPECES', 'VIREMENT']).optional(),
  date: z.string().trim().optional(),
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

    let datePaiement: Date | undefined;
    if (data.date) {
      datePaiement = new Date(data.date);
      if (Number.isNaN(datePaiement.getTime())) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Date invalide' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    if (data.teacherId) {
      const teacher = await prisma.teacher.findUnique({ where: { id: data.teacherId } });
      if (!teacher) {
        return NextResponse.json(
          { error: 'TEACHER_NOT_FOUND', message: 'Enseignant introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    try {
      const payment = await prisma.teacherPayment.update({
        where: { id },
        data: {
          ...(data.teacherId !== undefined ? { teacherId: data.teacherId } : {}),
          ...(data.periode !== undefined ? { periode: data.periode } : {}),
          ...(data.montant !== undefined ? { montant: data.montant } : {}),
          ...(data.moyenPaiement !== undefined ? { moyenPaiement: data.moyenPaiement } : {}),
          ...(datePaiement ? { datePaiement } : {}),
        },
        include: { teacher: true },
      });
      return NextResponse.json({ payment }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : null;
      if (code === 'P2025') {
        return NextResponse.json(
          { error: 'PAYMENT_NOT_FOUND', message: 'Paiement introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (code === 'P2002') {
        return NextResponse.json(
          {
            error: 'ALREADY_PAID',
            message: 'Cet enseignant a déjà été payé pour cette période',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
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
      await prisma.teacherPayment.delete({ where: { id } });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'PAYMENT_NOT_FOUND', message: 'Paiement introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

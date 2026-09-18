// PATCH  /api/accounting/registration/[id] — correct an inscription/
//        réinscription payment (student, statut, montant, moyen, date).
//        Changing `statut` recomputes `categorie` and writes the new
//        statut back onto the student, same as POST.
// DELETE /api/accounting/registration/[id] — void a mistaken payment.
//        Both require the 'accounting' menu — plain menu-key gating, no
//        TEACHER-role hardcode, since an admin can grant a TEACHER the
//        'accounting' bonus menu to help with payments (see menu-keys.ts).
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
  statut: z.enum(['NOUVEAU', 'ANCIEN']).optional(),
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
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const existing = await prisma.revenuePayment.findUnique({ where: { id } });
    if (!existing || !['INSCRIPTION', 'REINSCRIPTION'].includes(existing.categorie)) {
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

    const categorie = data.statut
      ? data.statut === 'ANCIEN'
        ? 'REINSCRIPTION'
        : 'INSCRIPTION'
      : existing.categorie;
    const source = `${categorie === 'REINSCRIPTION' ? 'Réinscription' : 'Inscription'} — ${existing.anneeScolaire}`;

    const payment = await prisma.$transaction(
      async (tx) => {
        if (data.statut && targetStudentId) {
          await tx.student.update({
            where: { id: targetStudentId },
            data: { statut: data.statut },
          });
        }
        return tx.revenuePayment.update({
          where: { id },
          data: {
            ...(data.studentId !== undefined ? { studentId: data.studentId } : {}),
            ...(data.montant !== undefined ? { montant: data.montant } : {}),
            ...(data.moyenPaiement !== undefined ? { moyenPaiement: data.moyenPaiement } : {}),
            ...(date ? { date } : {}),
            categorie,
            source,
          },
          include: { student: { include: { schoolClass: true } } },
        });
      },
      // Local dev shares a small Neon connection pool (see .env.local); the
      // default 2s maxWait is too eager for a possibly-busy shared pool.
      { maxWait: 10_000, timeout: 15_000 },
    );

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
    if (!existing || !['INSCRIPTION', 'REINSCRIPTION'].includes(existing.categorie)) {
      return NextResponse.json(
        { error: 'PAYMENT_NOT_FOUND', message: 'Paiement introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    await prisma.revenuePayment.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}

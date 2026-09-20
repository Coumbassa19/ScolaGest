// GET  /api/accounting/registration — list inscription/réinscription
//      payments (RevenuePayment rows with categorie INSCRIPTION or
//      REINSCRIPTION), most recent first. Accounting/revenue is purely an
//      admin/direction concern (no TEACHER-scoping the way students/grades
//      have) — gated to the 'accounting' menu so a TEACHER only sees this
//      if an admin explicitly grants it as a bonus menu (see
//      requireStaff/menu-keys.ts).
// POST /api/accounting/registration — record an inscription/réinscription
//      payment for a student. `statut` (NOUVEAU/ANCIEN) drives which
//      categorie the payment is filed under, and is also written back onto
//      Student.statut in the same transaction — the accounting page is
//      where this status actually gets corrected in practice, since the
//      fee tier depends on it (see CLAUDE.md school-domain notes).
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
import { createWithNumeroRecu } from '@/lib/server/receipt-number';

const Body = z.object({
  studentId: zCuid,
  statut: z.enum(['NOUVEAU', 'ANCIEN']),
  montant: z.number().int().positive(),
  moyenPaiement: z.enum(['ORANGE_MONEY', 'ESPECES', 'VIREMENT']).default('ESPECES'),
  anneeScolaire: z.string().trim().min(1).max(20).optional(),
  date: z.string().trim().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'accounting' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 200, 500);

    const payments = await prisma.revenuePayment.findMany({
      where: { categorie: { in: ['INSCRIPTION', 'REINSCRIPTION'] } },
      include: { student: { include: { schoolClass: true } } },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return NextResponse.json({ payments }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

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
    const data = parsed.data;
    const date = data.date ? new Date(data.date) : new Date();
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Date invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const student = await prisma.student.findUnique({ where: { id: data.studentId } });
    if (!student) {
      return NextResponse.json(
        { error: 'STUDENT_NOT_FOUND', message: 'Élève introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const categorie = data.statut === 'ANCIEN' ? 'REINSCRIPTION' : 'INSCRIPTION';
    const anneeScolaire = data.anneeScolaire ?? student.anneeScolaire;
    const source = `${categorie === 'REINSCRIPTION' ? 'Réinscription' : 'Inscription'} — ${anneeScolaire}`;

    const payment = await createWithNumeroRecu(
      prisma,
      date,
      async (tx, numeroRecu) => {
        await tx.student.update({ where: { id: data.studentId }, data: { statut: data.statut } });
        return tx.revenuePayment.create({
          data: {
            schoolId: requireSchoolId(auth.user.schoolId),
            montant: data.montant,
            source,
            moyenPaiement: data.moyenPaiement,
            studentId: data.studentId,
            categorie,
            anneeScolaire,
            date,
            statut: 'Reçu',
            numeroRecu,
          },
          include: { student: { include: { schoolClass: true } } },
        });
      },
      // Local dev shares a small Neon connection pool (see .env.local); the
      // default 2s maxWait is too eager for a possibly-busy shared pool.
      { maxWait: 10_000, timeout: 20_000 },
    );

    return NextResponse.json(
      { payment },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

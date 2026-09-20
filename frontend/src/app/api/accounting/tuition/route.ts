// POST /api/accounting/tuition — record a "frais de scolarité" installment
//      payment for a student (categorie SCOLARITE on RevenuePayment).
//      `periode` says which installment this covers — T1/T2/T3 for
//      trimestrial payers, ANNUEL for a single lump-sum payer. The page
//      itself (a Server Component) computes each student's montant dû /
//      payé / reste directly via Prisma — this route only handles the
//      write side. Gated to the 'accounting' menu (plain menu-key check —
//      see menu-keys.ts for the admin's bonus-menu-for-teachers feature).
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
  periode: z.enum(['T1', 'T2', 'T3', 'ANNUEL']),
  montant: z.number().int().positive(),
  moyenPaiement: z.enum(['ORANGE_MONEY', 'ESPECES', 'VIREMENT']).default('ESPECES'),
  anneeScolaire: z.string().trim().min(1).max(20).optional(),
  date: z.string().trim().optional(),
});

const PERIODE_LABEL: Record<string, string> = {
  T1: '1er trimestre',
  T2: '2ème trimestre',
  T3: '3ème trimestre',
  ANNUEL: 'Annuel',
};

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

    const anneeScolaire = data.anneeScolaire ?? student.anneeScolaire;
    const payment = await createWithNumeroRecu(
      prisma,
      date,
      async (tx, numeroRecu) =>
        tx.revenuePayment.create({
          data: {
            schoolId: requireSchoolId(auth.user.schoolId),
            montant: data.montant,
            source: `Scolarité — ${PERIODE_LABEL[data.periode]} (${anneeScolaire})`,
            moyenPaiement: data.moyenPaiement,
            studentId: data.studentId,
            categorie: 'SCOLARITE',
            periode: data.periode,
            anneeScolaire,
            date,
            statut: 'Reçu',
            numeroRecu,
          },
          include: { student: { include: { schoolClass: true } } },
        }),
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

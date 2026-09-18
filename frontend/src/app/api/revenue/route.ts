// GET  /api/revenue — list revenue payments (with student) — used by
//      /revenue-received and the dashboard's revenue chart.
// POST /api/revenue — record a payment (new-revenue form). `montant` is an
//      integer in GNF (no decimals — CLAUDE.md payment-amount invariant).
//      There's no dedicated 'revenue' menu key (see menu-keys.ts) — this
//      is the same accounting/revenue concern as everything under
//      /api/accounting, so both verbs are gated to the 'accounting' menu.
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
  montant: z.number().int().positive(),
  source: z.string().trim().min(1).max(150),
  moyenPaiement: z.enum(['WAVE', 'ORANGE_MONEY', 'ESPECES']).default('ESPECES'),
  studentId: zCuid.optional().or(z.literal('')),
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
      include: { student: true },
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

    const payment = await prisma.revenuePayment.create({
      data: {
        schoolId: requireSchoolId(auth.user.schoolId),
        montant: data.montant,
        source: data.source,
        moyenPaiement: data.moyenPaiement,
        ...(data.studentId ? { studentId: data.studentId } : {}),
        date,
        statut: 'Reçu',
      },
      include: { student: true },
    });
    return NextResponse.json(
      { payment },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

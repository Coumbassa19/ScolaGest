// PATCH  /api/accounting/expenses/[id] — correct an expense record.
// DELETE /api/accounting/expenses/[id] — void a mistaken expense record.
// Both gated to the 'accounting' menu, same as creation.
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
import { EXPENSE_CATEGORIES } from '../route';

const MAX_RECEIPT_BYTES = 500_000;

const Body = z.object({
  date: z.string().trim().optional(),
  categorie: z.enum(EXPENSE_CATEGORIES).optional(),
  description: z.string().trim().min(1).max(300).optional(),
  montant: z.number().int().positive().optional(),
  moyenPaiement: z.enum(['ORANGE_MONEY', 'ESPECES', 'VIREMENT']).optional(),
  beneficiaire: z.string().trim().max(150).optional(),
  receiptUrl: z
    .string()
    .trim()
    .max(MAX_RECEIPT_BYTES)
    .refine((s) => s.startsWith('data:image/'), 'receiptUrl must be an image data URL')
    .optional()
    .or(z.literal('')),
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
      const expense = await prisma.expense.update({
        where: { id },
        data: {
          ...(date ? { date } : {}),
          ...(data.categorie !== undefined ? { categorie: data.categorie } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.montant !== undefined ? { montant: data.montant } : {}),
          ...(data.moyenPaiement !== undefined ? { moyenPaiement: data.moyenPaiement } : {}),
          ...(data.beneficiaire !== undefined ? { beneficiaire: data.beneficiaire || null } : {}),
          ...(data.receiptUrl !== undefined ? { receiptUrl: data.receiptUrl || null } : {}),
        },
      });
      return NextResponse.json({ expense }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'EXPENSE_NOT_FOUND', message: 'Dépense introuvable' },
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
      await prisma.expense.delete({ where: { id } });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'EXPENSE_NOT_FOUND', message: 'Dépense introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

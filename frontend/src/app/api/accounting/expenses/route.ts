// POST /api/accounting/expenses — record money the school paid out (rent,
//      utilities, supplies, maintenance...). Mirrors POST
//      /api/accounting/teacher-payments in shape, but there's no
//      double-payment guard to enforce here — a school can legitimately
//      log several expenses in the same category on the same day. Gated to
//      the 'accounting' menu, same as every other Comptabilité page.
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

export const EXPENSE_CATEGORIES = [
  'LOYER',
  'ELECTRICITE_EAU',
  'FOURNITURES',
  'ENTRETIEN',
  'TRANSPORT',
  'COMMUNICATION',
  'ALIMENTATION',
  'TAXES',
  'AUTRE',
] as const;

// Same limit as Student.photoUrl / User.avatarUrl data-URL uploads.
const MAX_RECEIPT_BYTES = 500_000;

const Body = z.object({
  date: z.string().trim().optional(),
  categorie: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(1).max(300),
  montant: z.number().int().positive(),
  moyenPaiement: z.enum(['ORANGE_MONEY', 'ESPECES', 'VIREMENT']).default('ESPECES'),
  beneficiaire: z.string().trim().max(150).optional(),
  receiptUrl: z
    .string()
    .trim()
    .max(MAX_RECEIPT_BYTES)
    .refine((s) => s.startsWith('data:image/'), 'receiptUrl must be an image data URL')
    .optional()
    .or(z.literal('')),
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
    const date = data.date ? new Date(data.date) : new Date();
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Date invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const expense = await prisma.expense.create({
      data: {
        schoolId: requireSchoolId(auth.user.schoolId),
        date,
        categorie: data.categorie,
        description: data.description,
        montant: data.montant,
        moyenPaiement: data.moyenPaiement,
        ...(data.beneficiaire ? { beneficiaire: data.beneficiaire } : {}),
        ...(data.receiptUrl ? { receiptUrl: data.receiptUrl } : {}),
        recordedById: auth.user.sub,
      },
    });
    return NextResponse.json(
      { expense },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

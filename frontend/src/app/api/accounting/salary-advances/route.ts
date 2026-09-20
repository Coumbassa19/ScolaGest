// POST /api/accounting/salary-advances — record a salary advance (avance
//      sur salaire) to a teacher OR a staff member — a short-term loan
//      meant to be deducted from a specific future pay period. Exactly one
//      of teacherId/staffId must be set; Prisma has no portable "exactly
//      one of two FKs" constraint, so that's enforced here. Gated to the
//      'accounting' menu, same as every other Comptabilité page.
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

const Body = z
  .object({
    teacherId: zCuid.optional(),
    staffId: zCuid.optional(),
    montant: z.number().int().positive(),
    date: z.string().trim().optional(),
    motif: z.string().trim().max(300).optional(),
    periodeAAffecter: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM'),
    moyenPaiement: z.enum(['ORANGE_MONEY', 'ESPECES', 'VIREMENT']).default('ESPECES'),
  })
  .refine((d) => Boolean(d.teacherId) !== Boolean(d.staffId), {
    message: 'Choisis soit un enseignant, soit un membre du personnel — pas les deux.',
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

    if (data.teacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: data.teacherId },
        select: { id: true, schoolId: true },
      });
      if (!teacher) {
        return NextResponse.json(
          { error: 'TEACHER_NOT_FOUND', message: 'Enseignant introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    } else if (data.staffId) {
      const staffMember = await prisma.staff.findUnique({
        where: { id: data.staffId },
        select: { id: true, schoolId: true },
      });
      if (!staffMember) {
        return NextResponse.json(
          { error: 'STAFF_NOT_FOUND', message: 'Membre du personnel introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const advance = await prisma.salaryAdvance.create({
      data: {
        schoolId: requireSchoolId(auth.user.schoolId),
        ...(data.teacherId ? { teacherId: data.teacherId } : {}),
        ...(data.staffId ? { staffId: data.staffId } : {}),
        montant: data.montant,
        date,
        ...(data.motif ? { motif: data.motif } : {}),
        periodeAAffecter: data.periodeAAffecter,
        moyenPaiement: data.moyenPaiement,
      },
      include: { teacher: true, staff: true },
    });
    return NextResponse.json(
      { advance },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// POST /api/accounting/teacher-payments — record a salary payment to a
//      teacher for one pay period ("YYYY-MM"). The @@unique([teacherId,
//      periode]) constraint on TeacherPayment makes double-paying the same
//      teacher for the same month impossible at the DB level — surfaced
//      here as a clear 409 instead of a raw 500. Gated to the 'accounting'
//      menu (plain menu-key check, no TEACHER-role hardcode — see
//      menu-keys.ts for the admin's bonus-menu-for-teachers feature).
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
  teacherId: zCuid,
  periode: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM'),
  montant: z.number().int().positive(),
  moyenPaiement: z.enum(['WAVE', 'ORANGE_MONEY', 'ESPECES', 'VIREMENT']).default('ESPECES'),
  date: z.string().trim().optional(),
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
    const datePaiement = data.date ? new Date(data.date) : new Date();
    if (Number.isNaN(datePaiement.getTime())) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Date invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const teacher = await prisma.teacher.findUnique({ where: { id: data.teacherId } });
    if (!teacher) {
      return NextResponse.json(
        { error: 'TEACHER_NOT_FOUND', message: 'Enseignant introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const payment = await prisma.teacherPayment.create({
        data: {
          schoolId: requireSchoolId(auth.user.schoolId),
          teacherId: data.teacherId,
          periode: data.periode,
          montant: data.montant,
          moyenPaiement: data.moyenPaiement,
          datePaiement,
        },
        include: { teacher: true },
      });
      return NextResponse.json(
        { payment },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      const isUniqueClash =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
      if (isUniqueClash) {
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

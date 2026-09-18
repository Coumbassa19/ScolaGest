// GET    /api/teachers/[id] — single teacher detail (used by the edit page).
// PATCH  /api/teachers/[id] — partial update of a teacher's profile.
// DELETE /api/teachers/[id] — removes a teacher. Subject.teacherId and
//       ScheduleEntry.teacherId both use onDelete: SetNull in the schema, so
//       deleting a teacher safely unassigns them from subjects/sessions
//       instead of cascading destructively — no manual cleanup needed here.
//       All three verbs require the 'teachers' menu — HR records are an
//       admin/direction concern, so no TEACHER self-view scoping is added
//       here (see GET /api/teachers for why).
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

const Body = z.object({
  nom: z.string().trim().min(1).max(80).optional(),
  prenom: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  telephone: z.string().trim().max(40).optional(),
  specialite: z.string().trim().min(1).max(80).optional(),
  statut: z.enum(['TEMPS_PLEIN', 'VACATAIRE']).optional(),
  classesAssignees: z.string().trim().max(300).optional(),
  remunerationMensuelle: z.number().int().nonnegative().optional(),
  tauxHoraire: z.number().int().nonnegative().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'teachers' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    const teacher = await prisma.teacher.findUnique({ where: { id } });
    if (!teacher) {
      return NextResponse.json(
        { error: 'TEACHER_NOT_FOUND', message: 'Enseignant introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json({ teacher }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'teachers' });
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

    try {
      const teacher = await prisma.teacher.update({
        where: { id },
        data: {
          ...(data.nom !== undefined ? { nom: data.nom } : {}),
          ...(data.prenom !== undefined ? { prenom: data.prenom } : {}),
          ...(data.email !== undefined ? { email: data.email || null } : {}),
          ...(data.telephone !== undefined ? { telephone: data.telephone || null } : {}),
          ...(data.specialite !== undefined ? { specialite: data.specialite } : {}),
          ...(data.statut !== undefined ? { statut: data.statut } : {}),
          ...(data.classesAssignees !== undefined
            ? { classesAssignees: data.classesAssignees || null }
            : {}),
          ...(data.remunerationMensuelle !== undefined
            ? { remunerationMensuelle: data.remunerationMensuelle }
            : {}),
          ...(data.tauxHoraire !== undefined ? { tauxHoraire: data.tauxHoraire } : {}),
        },
      });
      return NextResponse.json({ teacher }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'TEACHER_NOT_FOUND', message: 'Enseignant introuvable' },
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

    const auth = await requireStaff({ menuKey: 'teachers' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    try {
      await prisma.teacher.delete({ where: { id } });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'TEACHER_NOT_FOUND', message: 'Enseignant introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

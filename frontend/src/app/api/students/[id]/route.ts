// GET    /api/students/[id] — single student detail. No fetch caller
//       currently uses it (the students/[id] edit page loads its data via
//       prisma server-side), but it's still a student record disclosure
//       endpoint, so it's gated like the rest of this cluster rather than
//       left open on the assumption it's unused. Gated to the 'students'
//       menu (not shared cross-menu the way GET /api/students is).
// PATCH  /api/students/[id] — partial update. Originally just {classId,
//       anneeScolaire} for reregister-student; extended to accept the full
//       set of editable fields for the students/[id] edit form. All fields
//       optional — only provided ones are updated.
// DELETE /api/students/[id] — removes a student. Grade rows cascade (schema
//       onDelete: Cascade) and RevenuePayment.studentId is set null (schema
//       onDelete: SetNull) — both handled at the DB level, no manual cleanup
//       needed here.
//       PATCH/DELETE (and the batch-oriented GET above) all require the
//       'students' menu — enrolling/editing/removing students is a
//       direction/admin action, not something a teacher does (a teacher
//       only ever reads their own classes' rosters via
//       GET /api/students?classId=, which is unaffected by this file).
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
  nom: z.string().trim().min(1).max(80).optional(),
  prenom: z.string().trim().min(1).max(80).optional(),
  dateNaissance: z.string().trim().min(1).optional(),
  ville: z.string().trim().max(120).optional(),
  quartier: z.string().trim().max(120).optional(),
  sexe: z.enum(['M', 'F']).optional(),
  classId: zCuid.optional(),
  anneeScolaire: z.string().trim().min(1).max(20).optional(),
  statut: z.enum(['NOUVEAU', 'ANCIEN']).optional(),
  matricule: z.string().trim().min(1).max(40).optional(),
  photoUrl: z.string().trim().max(700_000).nullable().optional(),
  parentNom: z.string().trim().max(120).optional().or(z.literal('')),
  parentTelephone: z.string().trim().max(30).optional().or(z.literal('')),
  parentEmail: z.string().trim().email().max(160).optional().or(z.literal('')),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    const student = await prisma.student.findUnique({
      where: { id },
      include: { schoolClass: true },
    });
    if (!student) {
      return NextResponse.json(
        { error: 'STUDENT_NOT_FOUND', message: 'Élève introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json({ student }, { headers: { 'x-request-id': ctx.requestId } });
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

    const auth = await requireStaff({ menuKey: 'students' });
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

    if (data.classId) {
      const schoolClass = await prisma.schoolClass.findUnique({ where: { id: data.classId } });
      if (!schoolClass) {
        return NextResponse.json(
          { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    let dateNaissance: Date | undefined;
    if (data.dateNaissance) {
      dateNaissance = new Date(data.dateNaissance);
      if (Number.isNaN(dateNaissance.getTime())) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Date de naissance invalide' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    try {
      const student = await prisma.student.update({
        where: { id },
        data: {
          ...(data.nom !== undefined ? { nom: data.nom } : {}),
          ...(data.prenom !== undefined ? { prenom: data.prenom } : {}),
          ...(dateNaissance ? { dateNaissance } : {}),
          ...(data.ville !== undefined ? { ville: data.ville } : {}),
          ...(data.quartier !== undefined ? { quartier: data.quartier } : {}),
          ...(data.sexe !== undefined ? { sexe: data.sexe } : {}),
          ...(data.classId !== undefined ? { classId: data.classId } : {}),
          ...(data.anneeScolaire !== undefined ? { anneeScolaire: data.anneeScolaire } : {}),
          ...(data.statut !== undefined ? { statut: data.statut } : {}),
          ...(data.matricule !== undefined ? { matricule: data.matricule } : {}),
          ...(data.photoUrl !== undefined ? { photoUrl: data.photoUrl || null } : {}),
          ...(data.parentNom !== undefined ? { parentNom: data.parentNom || null } : {}),
          ...(data.parentTelephone !== undefined
            ? { parentTelephone: data.parentTelephone || null }
            : {}),
          ...(data.parentEmail !== undefined ? { parentEmail: data.parentEmail || null } : {}),
        },
        include: { schoolClass: true },
      });
      return NextResponse.json({ student }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : null;
      if (code === 'P2025') {
        return NextResponse.json(
          { error: 'STUDENT_NOT_FOUND', message: 'Élève introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (code === 'P2002') {
        return NextResponse.json(
          { error: 'MATRICULE_ALREADY_EXISTS', message: 'Ce matricule est déjà utilisé' },
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

    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    try {
      await prisma.student.delete({ where: { id } });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'STUDENT_NOT_FOUND', message: 'Élève introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

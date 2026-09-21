// GET  /api/students?classId=&search= — list students (optionally filtered
//      by class or a nom/prenom search — used by /students, enter-grades,
//      new-revenue, and reregister-student). Deliberately gated with a
//      plain requireStaff() (no menuKey) rather than menuKey:'students' —
//      it's shared infrastructure the grades/messages menus also depend on
//      for lookups, so it only requires SOME staff session, not the
//      'students' menu specifically. TEACHER role is still scoped to their
//      own classes' students either way (see below) — a teacher without
//      the 'students' menu enabled can still fetch their own class roster
//      for grade entry, but never the whole school's.
// POST /api/students — enroll a new student (add-student form). `matricule`
//      is optional: server-generated (ELE-<year>-<seq>) when omitted, or the
//      value the user typed when they want to set it manually (e.g. to match
//      an existing paper registry). Gated to the 'students' menu — enrolling
//      students is an admin/direction action, not something a teacher does.
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
import { nextMatricule } from '@/lib/server/students';
import { zCuid } from '@/lib/server/zod-helpers';
import { getTeacherClassIds } from '@/lib/server/permissions/teacher-scope';
import { getStudentCapacity } from '@/lib/server/billing/plan-limits';

const Body = z.object({
  nom: z.string().trim().min(1).max(80),
  prenom: z.string().trim().min(1).max(80),
  dateNaissance: z.string().trim().min(1).optional(),
  lieuNaissance: z.string().trim().max(120).optional(),
  quartier: z.string().trim().max(120).optional(),
  sexe: z.enum(['M', 'F']).default('M'),
  classId: zCuid,
  anneeScolaire: z.string().trim().min(1).max(20).default('2024-2025'),
  matricule: z.string().trim().min(1).max(40).optional(),
  // Data URL (no Cloudinary configured yet) — capped well above the 500KB
  // client-side limit to leave room for base64 overhead.
  photoUrl: z.string().trim().max(700_000).nullable().optional(),
  parentNom: z.string().trim().max(120).optional(),
  parentTelephone: z.string().trim().max(30).optional(),
  parentEmail: z.string().trim().email().max(160).optional().or(z.literal('')),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff();
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId') || undefined;
    const search = searchParams.get('search')?.trim() || undefined;

    let teacherClassIds: string[] | undefined;
    if (auth.user.role === 'TEACHER') {
      if (!auth.user.teacherId) {
        return NextResponse.json(
          { error: 'TEACHER_NOT_LINKED', message: 'No teacher record linked to this account' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      teacherClassIds = await getTeacherClassIds(prisma, auth.user.teacherId);
      if (classId && !teacherClassIds.includes(classId)) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Not your class' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const students = await prisma.student.findMany({
      where: {
        ...(classId ? { classId } : teacherClassIds ? { classId: { in: teacherClassIds } } : {}),
        ...(search
          ? {
              OR: [
                { nom: { contains: search, mode: 'insensitive' } },
                { prenom: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { schoolClass: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    return NextResponse.json({ students }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'students' });
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

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: data.classId } });
    if (!schoolClass) {
      return NextResponse.json(
        { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const capacity = await getStudentCapacity(prisma, requireSchoolId(auth.user.schoolId));
    if (capacity.remaining <= 0) {
      return NextResponse.json(
        {
          error: 'PLAN_LIMIT_REACHED',
          message: `Le forfait actuel est limité à ${capacity.limit} élèves. Passez au forfait Croissance pour inscrire plus d'élèves.`,
          limit: capacity.limit,
          current: capacity.current,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const dateNaissance = data.dateNaissance ? new Date(data.dateNaissance) : undefined;
    if (data.dateNaissance && Number.isNaN(dateNaissance?.getTime())) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Date de naissance invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // When the user typed a matricule themselves, respect it exactly — try
    // once and surface a clear conflict error rather than silently retrying
    // with a different value. When omitted, auto-generate with a small retry
    // loop in case of a rare collision under concurrent enrollments
    // (count-based sequence is not itself atomic — acceptable for this
    // prototype's non-financial, cosmetic id).
    let student;
    try {
      if (data.matricule) {
        student = await prisma.student.create({
          data: {
            schoolId: requireSchoolId(auth.user.schoolId),
            matricule: data.matricule,
            nom: data.nom,
            prenom: data.prenom,
            ...(dateNaissance ? { dateNaissance } : {}),
            ...(data.lieuNaissance ? { lieuNaissance: data.lieuNaissance } : {}),
            ...(data.quartier ? { quartier: data.quartier } : {}),
            sexe: data.sexe,
            classId: data.classId,
            anneeScolaire: data.anneeScolaire,
            photoUrl: data.photoUrl || null,
            ...(data.parentNom ? { parentNom: data.parentNom } : {}),
            ...(data.parentTelephone ? { parentTelephone: data.parentTelephone } : {}),
            ...(data.parentEmail ? { parentEmail: data.parentEmail } : {}),
          },
          include: { schoolClass: true },
        });
      } else {
        for (let attempt = 0; attempt < 3; attempt++) {
          const matricule = await nextMatricule(data.anneeScolaire);
          try {
            student = await prisma.student.create({
              data: {
                schoolId: requireSchoolId(auth.user.schoolId),
                matricule,
                nom: data.nom,
                prenom: data.prenom,
                ...(dateNaissance ? { dateNaissance } : {}),
                ...(data.lieuNaissance ? { lieuNaissance: data.lieuNaissance } : {}),
                ...(data.quartier ? { quartier: data.quartier } : {}),
                sexe: data.sexe,
                classId: data.classId,
                anneeScolaire: data.anneeScolaire,
                photoUrl: data.photoUrl || null,
                ...(data.parentNom ? { parentNom: data.parentNom } : {}),
                ...(data.parentTelephone ? { parentTelephone: data.parentTelephone } : {}),
                ...(data.parentEmail ? { parentEmail: data.parentEmail } : {}),
              },
              include: { schoolClass: true },
            });
            break;
          } catch (err) {
            const isUniqueClash =
              typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
            if (!isUniqueClash || attempt === 2) throw err;
          }
        }
      }
    } catch (err) {
      const isUniqueClash =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
      if (isUniqueClash) {
        return NextResponse.json(
          { error: 'MATRICULE_ALREADY_EXISTS', message: 'Ce matricule est déjà utilisé' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    return NextResponse.json(
      { student },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

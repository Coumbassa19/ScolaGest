// GET  /api/teachers — list all teachers (the full staff roster — used by
//      /teachers). Gated to the 'teachers' menu specifically: unlike
//      GET /api/students, this is not shared cross-menu infrastructure, so
//      a TEACHER account doesn't get it via their always-on core menus
//      (dashboard/grades/subjects) unless an admin grants the 'teachers'
//      bonus menu — no self-view scoping is added here, since "a teacher
//      can see their own HR profile" isn't a feature that exists yet.
// POST /api/teachers — create a teacher (add-teacher form). HR-record
//      creation is an admin/direction action, so it's gated the same way.
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

const Body = z.object({
  nom: z.string().trim().min(1).max(80),
  prenom: z.string().trim().min(1).max(80),
  email: z.string().trim().email().optional().or(z.literal('')),
  telephone: z.string().trim().max(40).optional(),
  specialite: z.string().trim().max(80).optional(),
  statut: z.enum(['TEMPS_PLEIN', 'VACATAIRE']).default('TEMPS_PLEIN'),
  classesAssignees: z.string().trim().max(300).optional(),
  remunerationMensuelle: z.number().int().nonnegative().optional(),
  tauxHoraire: z.number().int().nonnegative().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'teachers' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const teachers = await prisma.teacher.findMany({
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    return NextResponse.json({ teachers }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'teachers' });
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
    // A VACATAIRE teacher is paid taux horaire × heures réelles de l'emploi
    // du temps (see Comptabilité > Paiement des enseignants) — leaving this
    // unset doesn't error there, it silently computes a 0 GNF salary. Caught
    // here instead of discovered at payment time.
    if (data.statut === 'VACATAIRE' && !(data.tauxHoraire && data.tauxHoraire > 0)) {
      return NextResponse.json(
        {
          error: 'HOURLY_RATE_REQUIRED',
          message: 'Hourly rate is required for a VACATAIRE teacher.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const teacher = await prisma.teacher.create({
      data: {
        schoolId: requireSchoolId(auth.user.schoolId),
        nom: data.nom,
        prenom: data.prenom,
        ...(data.email ? { email: data.email } : {}),
        ...(data.telephone ? { telephone: data.telephone } : {}),
        ...(data.specialite ? { specialite: data.specialite } : {}),
        statut: data.statut,
        ...(data.classesAssignees ? { classesAssignees: data.classesAssignees } : {}),
        ...(data.remunerationMensuelle !== undefined
          ? { remunerationMensuelle: data.remunerationMensuelle }
          : {}),
        ...(data.tauxHoraire !== undefined ? { tauxHoraire: data.tauxHoraire } : {}),
      },
    });
    return NextResponse.json(
      { teacher },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// GET /api/bulletin/pdf?studentId=&periode=&anneeScolaire= — "Télécharger
//     PDF" on /bulletin: downloads that one student's bulletin as a
//     single-page PDF. Shares the exact same layout code
//     (src/lib/server/bulletin-pdf.ts) as the bulk "Télécharger les
//     bulletins (PDF)" export on /grades (src/app/api/grades/bulletins/pdf),
//     so the two can never drift apart — a single download here is just a
//     one-student version of that same PDF. Gated to the 'grades' menu — a
//     bulletin is a grades output, reached from the grades/bulletin pages.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeClassRanking } from '@/lib/server/bulletin';
import { buildBulletinsPdf, type BulletinPdfStudent } from '@/lib/server/bulletin-pdf';
import { defaultObservation } from '@/lib/bulletin-format';
import { getSchoolSettings } from '@/lib/server/school-settings';
import { requireSchoolId } from '@/lib/server/tenant/context';

const PERIODES = ['T1', 'T2', 'T3'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'grades' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;
    const schoolId = requireSchoolId(auth.user.schoolId);

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || undefined;
    const periode = searchParams.get('periode') || 'T1';
    const anneeScolaire = searchParams.get('anneeScolaire') || undefined;

    if (!studentId || !anneeScolaire || !PERIODES.includes(periode)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'studentId, période et année scolaire sont obligatoires.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { schoolClass: { include: { cycle: true } } },
    });
    if (!student) {
      return NextResponse.json(
        { error: 'STUDENT_NOT_FOUND', message: 'Élève introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [grades, savedRemark, { rankByStudent, totalStudents }, school] = await Promise.all([
      prisma.grade.findMany({
        where: { studentId, periode, anneeScolaire },
        include: { subject: true },
        orderBy: { subject: { nom: 'asc' } },
      }),
      prisma.bulletinRemark.findUnique({ where: { studentId_periode: { studentId, periode } } }),
      computeClassRanking(prisma, student.classId, periode, anneeScolaire),
      getSchoolSettings(prisma, schoolId),
    ]);

    const totalCoeff = grades.reduce((sum, g) => sum + g.subject.coefficient, 0);
    const totalPoints = grades.reduce((sum, g) => sum + g.valeur * g.subject.coefficient, 0);
    const moyenne = totalCoeff > 0 ? totalPoints / totalCoeff : null;
    const rank = rankByStudent.get(student.id);

    const pdfStudent: BulletinPdfStudent = {
      nom: student.nom,
      prenom: student.prenom,
      sexe: student.sexe,
      matricule: student.matricule,
      className: student.schoolClass.name,
      dateNaissance: student.dateNaissance,
      grades: grades.map((g) => ({
        subjectNom: g.subject.nom,
        coefficient: g.subject.coefficient,
        valeur: g.valeur,
      })),
      observation:
        savedRemark?.observation ?? defaultObservation(moyenne, student.schoolClass.cycle.noteMax),
      rang: rank?.rang ?? null,
      rangTied: rank?.tied ?? false,
      totalClasse: totalStudents,
    };

    const buffer = await buildBulletinsPdf({
      periode,
      anneeScolaire,
      students: [pdfStudent],
      school,
      noteMax: student.schoolClass.cycle.noteMax,
    });

    const filename =
      `bulletin-${student.nom}-${student.prenom}-${periode}-${anneeScolaire}.pdf`.replace(
        /[^\w.-]+/g,
        '_',
      );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'x-request-id': ctx.requestId,
      },
    });
  });
}

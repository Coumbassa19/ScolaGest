// GET /api/grades/bulletins/pdf?classId=&periode=&anneeScolaire= — downloads
//     every student's bulletin for this class/period/year as ONE PDF file,
//     one bulletin per page, pages following each other in the same order
//     as the class list (nom, prenom — same order /grades and /students
//     use). Shares the exact wording (src/lib/bulletin-format.ts) and
//     ranking (src/lib/server/bulletin.ts) with the single-student bulletin
//     at /bulletin, so a page here always matches what /bulletin shows for
//     that student. PDF layout itself lives in src/lib/server/bulletin-pdf.ts.
//     Gated to the 'grades' menu — this is a grades output reached from the
//     /grades page.
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
import { buildMoyenneMatiereMap, computeMoyenneGenerale } from '@/lib/server/grades/moyenne';
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
    const classId = searchParams.get('classId') || undefined;
    const periode = searchParams.get('periode') || 'T1';
    const anneeScolaire = searchParams.get('anneeScolaire') || undefined;

    if (!classId || !anneeScolaire || !PERIODES.includes(periode)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'classId, période et année scolaire sont obligatoires.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const school = await getSchoolSettings(prisma, schoolId);
    const [schoolClass, students, grades, remarks, ranking] = await Promise.all([
      prisma.schoolClass.findUnique({ where: { id: classId }, include: { cycle: true } }),
      prisma.student.findMany({
        where: { classId },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
      prisma.grade.findMany({
        where: { classId, periode, anneeScolaire },
        include: { subject: true },
        orderBy: { subject: { nom: 'asc' } },
      }),
      prisma.bulletinRemark.findMany({ where: { periode, student: { classId } } }),
      computeClassRanking(
        prisma,
        classId,
        periode,
        anneeScolaire,
        school.coefDevoir,
        school.coefComposition,
      ),
    ]);

    if (!schoolClass) {
      return NextResponse.json(
        { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (students.length === 0) {
      return NextResponse.json(
        { error: 'NO_STUDENTS', message: 'Aucun élève dans cette classe.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const gradesByStudent = new Map<string, typeof grades>();
    for (const g of grades) {
      const list = gradesByStudent.get(g.studentId) ?? [];
      list.push(g);
      gradesByStudent.set(g.studentId, list);
    }
    const remarkByStudent = new Map(remarks.map((r) => [r.studentId, r.observation]));
    const { rankByStudent, totalStudents } = ranking;
    const moyenneMatiereByStudentSubject = buildMoyenneMatiereMap(
      grades,
      school.coefDevoir,
      school.coefComposition,
    );

    const pdfStudents: BulletinPdfStudent[] = students.map((s) => {
      const studentGrades = gradesByStudent.get(s.id) ?? [];
      const subjectsUnique = Array.from(
        new Map(studentGrades.map((g) => [g.subjectId, g.subject])).values(),
      );
      const moyenne = computeMoyenneGenerale(
        subjectsUnique.map((subj) => ({
          moyenne: moyenneMatiereByStudentSubject.get(`${s.id}:${subj.id}`) ?? null,
          coefficient: subj.coefficient,
        })),
      );
      const rank = rankByStudent.get(s.id);
      return {
        nom: s.nom,
        prenom: s.prenom,
        sexe: s.sexe,
        matricule: s.matricule,
        className: schoolClass.name,
        dateNaissance: s.dateNaissance,
        grades: subjectsUnique.map((subj) => {
          const devoirs = studentGrades.filter(
            (g) => g.subjectId === subj.id && g.type === 'DEVOIR',
          );
          const composition = studentGrades.find(
            (g) => g.subjectId === subj.id && g.type === 'COMPOSITION',
          );
          return {
            subjectNom: subj.nom,
            coefficient: subj.coefficient,
            moyenneDevoirs:
              devoirs.length > 0
                ? devoirs.reduce((sum, d) => sum + d.valeur, 0) / devoirs.length
                : null,
            composition: composition?.valeur ?? null,
            moyenne: moyenneMatiereByStudentSubject.get(`${s.id}:${subj.id}`) ?? null,
          };
        }),
        observation:
          remarkByStudent.get(s.id) ?? defaultObservation(moyenne, schoolClass.cycle.noteMax),
        rang: rank?.rang ?? null,
        rangTied: rank?.tied ?? false,
        totalClasse: totalStudents,
      };
    });

    const buffer = await buildBulletinsPdf({
      periode,
      anneeScolaire,
      students: pdfStudents,
      school,
      noteMax: schoolClass.cycle.noteMax,
    });

    const filename = `bulletins-${schoolClass.name}-${periode}-${anneeScolaire}.pdf`.replace(
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

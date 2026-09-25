// GET /api/grades/export?classId=&periode=&anneeScolaire= — downloads the
//     grades table shown on /grades (same class/period/year filters) as an
//     .xlsx file: Matricule, Nom, Prénom, then 3 columns per subject
//     (Devoirs, Composition, Moyenne), and an overall Moyenne. This is a
//     reporting/printing export, not a re-importable file: the "Moyenne"
//     columns are computed (a blend of several devoirs + the composition,
//     weighted by the school's coefficients — see
//     src/lib/server/grades/moyenne.ts), so re-importing a modified moyenne
//     value would silently double-count it against the raw devoirs/
//     composition rows still stored. To bulk-correct grades via Excel, use
//     the import page (/grades/import), which targets one assessment type
//     at a time. Gated to the 'grades' menu — this is a grades output
//     reached from the /grades page.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { writeSheetBuffer } from '@/lib/server/import/write-sheet';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { buildMoyenneMatiereMap, computeMoyenneGenerale } from '@/lib/server/grades/moyenne';
import { getSchoolSettings } from '@/lib/server/school-settings';
import { requireSchoolId } from '@/lib/server/tenant/context';

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

    if (!classId || !anneeScolaire) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'classId et anneeScolaire sont obligatoires' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [schoolClass, students, grades, schoolSettings] = await Promise.all([
      prisma.schoolClass.findUnique({ where: { id: classId } }),
      prisma.student.findMany({
        where: { classId },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
      prisma.grade.findMany({
        where: { classId, periode, anneeScolaire },
        include: { subject: true },
      }),
      getSchoolSettings(prisma, schoolId),
    ]);
    if (!schoolClass) {
      return NextResponse.json(
        { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subjectMap = new Map<string, { id: string; nom: string; coefficient: number }>();
    for (const g of grades) {
      if (!subjectMap.has(g.subjectId)) {
        subjectMap.set(g.subjectId, {
          id: g.subjectId,
          nom: g.subject.nom,
          coefficient: g.subject.coefficient,
        });
      }
    }
    const subjects = [...subjectMap.values()].sort((a, b) => a.nom.localeCompare(b.nom));

    const moyenneMatiereByStudentSubject = buildMoyenneMatiereMap(
      grades,
      schoolSettings.coefDevoir,
      schoolSettings.coefComposition,
    );
    function moyenneDevoirsFor(studentId: string, subjectId: string): number | null {
      const devoirs = grades.filter(
        (g) => g.studentId === studentId && g.subjectId === subjectId && g.type === 'DEVOIR',
      );
      return devoirs.length > 0
        ? devoirs.reduce((sum, d) => sum + d.valeur, 0) / devoirs.length
        : null;
    }
    function compositionFor(studentId: string, subjectId: string): number | null {
      return (
        grades.find(
          (g) => g.studentId === studentId && g.subjectId === subjectId && g.type === 'COMPOSITION',
        )?.valeur ?? null
      );
    }

    function getMoyenne(studentId: string): number | null {
      return computeMoyenneGenerale(
        subjects.map((s) => ({
          moyenne: moyenneMatiereByStudentSubject.get(`${studentId}:${s.id}`) ?? null,
          coefficient: s.coefficient,
        })),
      );
    }

    const headerRow = [
      'Matricule',
      'Nom',
      'Prénom',
      ...subjects.flatMap((s) => [
        `${s.nom} (Devoirs)`,
        `${s.nom} (Composition)`,
        `${s.nom} (Moyenne)`,
      ]),
      'Moyenne',
    ];
    const dataRows = students.map((s) => {
      const moyenne = getMoyenne(s.id);
      return [
        s.matricule,
        s.nom,
        s.prenom,
        ...subjects.flatMap((subj) => {
          const moyenneDevoirs = moyenneDevoirsFor(s.id, subj.id);
          const composition = compositionFor(s.id, subj.id);
          const moyenneMatiere = moyenneMatiereByStudentSubject.get(`${s.id}:${subj.id}`) ?? null;
          return [
            moyenneDevoirs !== null ? Math.round(moyenneDevoirs * 10) / 10 : '',
            composition !== null ? composition : '',
            moyenneMatiere !== null ? Math.round(moyenneMatiere * 100) / 100 : '',
          ];
        }),
        moyenne !== null ? Math.round(moyenne * 100) / 100 : '',
      ];
    });

    const buffer = await writeSheetBuffer([headerRow, ...dataRows], {
      sheetName: 'Notes',
      colWidth: 16,
    });

    const filename = `notes-${schoolClass.name}-${periode}-${anneeScolaire}.xlsx`.replace(
      /[^\w.-]+/g,
      '_',
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'x-request-id': ctx.requestId,
      },
    });
  });
}

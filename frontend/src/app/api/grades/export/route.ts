// GET /api/grades/export?classId=&periode=&anneeScolaire= — downloads the
//     grades table shown on /grades (same class/period/year filters) as an
//     .xlsx file: Matricule, Nom, Prénom, one column per subject that has
//     grades in this context, and Moyenne. Same column layout the import
//     side reads (src/lib/grades-import-columns.ts), so an export can be
//     edited and re-imported. Gated to the 'grades' menu — this is a
//     grades output reached from the /grades page.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'grades' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

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

    const [schoolClass, students, grades] = await Promise.all([
      prisma.schoolClass.findUnique({ where: { id: classId } }),
      prisma.student.findMany({
        where: { classId },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
      prisma.grade.findMany({
        where: { classId, periode, anneeScolaire },
        include: { subject: true },
      }),
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

    const noteByStudentSubject = new Map<string, number>();
    for (const g of grades) noteByStudentSubject.set(`${g.studentId}:${g.subjectId}`, g.valeur);

    function getMoyenne(studentId: string): number | null {
      let total = 0;
      let coeffTotal = 0;
      for (const s of subjects) {
        const note = noteByStudentSubject.get(`${studentId}:${s.id}`);
        if (note !== undefined) {
          total += note * s.coefficient;
          coeffTotal += s.coefficient;
        }
      }
      return coeffTotal > 0 ? total / coeffTotal : null;
    }

    const headerRow = ['Matricule', 'Nom', 'Prénom', ...subjects.map((s) => s.nom), 'Moyenne'];
    const dataRows = students.map((s) => {
      const moyenne = getMoyenne(s.id);
      return [
        s.matricule,
        s.nom,
        s.prenom,
        ...subjects.map((subj) => noteByStudentSubject.get(`${s.id}:${subj.id}`) ?? ''),
        moyenne !== null ? Math.round(moyenne * 100) / 100 : '',
      ];
    });

    const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    sheet['!cols'] = headerRow.map(() => ({ wch: 16 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Notes');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

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

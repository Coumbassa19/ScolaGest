// POST /api/grades/import — bulk-save grades from an uploaded Excel
//      (.xlsx/.xls) or CSV file for one class/period/year, all subjects at
//      once (enter-grades only ever handles one subject at a time — this is
//      the "grade a whole class in one file" path). See
//      src/lib/grades-import-columns.ts for the expected column layout,
//      shared with the downloadable template
//      (GET /api/grades/import/template) and the on-page format preview.
//      Requires the 'grades' menu and is blocked for TEACHER outright — it
//      writes grades across every subject for the class in one shot
//      (not just the teacher's own), so it's an admin/direction bulk
//      action rather than a scoped teacher one.
//
// Students are matched within the chosen class by matricule (unambiguous)
// or, failing that, by nom+prenom — never across classes, so a common name
// in another class can't collide. Notes are upserted one at a time rather
// than in a single transaction: one bad cell shouldn't discard an otherwise
// good file.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { verifyCsrf } from '@/lib/server/auth';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { requireSchoolId } from '@/lib/server/tenant/context';
import { parseGradesSheet, type GradeImportRowError } from '@/lib/grades-import-columns';

const MAX_FILE_BYTES = 5_000_000;
const PERIODES = ['T1', 'T2', 'T3'];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'grades' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;
    if (auth.user.role === 'TEACHER') {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Teachers cannot bulk-import grades' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    const classId = form?.get('classId');
    const periode = form?.get('periode');
    const anneeScolaire = form?.get('anneeScolaire');

    if (
      !(file instanceof File) ||
      typeof classId !== 'string' ||
      !classId ||
      typeof periode !== 'string' ||
      !PERIODES.includes(periode) ||
      typeof anneeScolaire !== 'string' ||
      !anneeScolaire
    ) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Fichier, classe, période et année scolaire sont obligatoires.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'FILE_TOO_LARGE', message: 'Fichier trop volumineux (max 5 Mo).' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [schoolClass, subjects, students] = await Promise.all([
      prisma.schoolClass.findUnique({ where: { id: classId }, include: { cycle: true } }),
      prisma.subject.findMany({ select: { id: true, nom: true } }),
      prisma.student.findMany({
        where: { classId },
        select: { id: true, matricule: true, nom: true, prenom: true },
      }),
    ]);
    if (!schoolClass) {
      return NextResponse.json(
        { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let rows: unknown[][];
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) throw new Error('empty workbook');
      rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: '',
      });
    } catch {
      return NextResponse.json(
        {
          error: 'INVALID_FILE',
          message:
            'Fichier illisible — vérifie qu’il s’agit bien d’un fichier Excel (.xlsx) ou CSV.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { valid, errors: parseErrors } = parseGradesSheet(
      rows,
      subjects,
      schoolClass.cycle.noteMax,
    );
    if (valid.length === 0) {
      return NextResponse.json(
        {
          error: 'NO_VALID_ROWS',
          message: 'Aucune ligne valide trouvée dans le fichier.',
          errors: parseErrors,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const byMatricule = new Map(students.map((s) => [s.matricule, s]));
    const byName = new Map<string, typeof students>();
    for (const s of students) {
      const key = `${s.nom.trim().toLowerCase()}|${s.prenom.trim().toLowerCase()}`;
      const list = byName.get(key) ?? [];
      list.push(s);
      byName.set(key, list);
    }

    const errors: GradeImportRowError[] = [...parseErrors];
    let imported = 0;
    let totalNotes = 0;

    for (const row of valid) {
      totalNotes += row.notes.length;
      if (row.notes.length === 0) continue; // nothing to save for this row

      let student = row.matricule ? byMatricule.get(row.matricule) : undefined;
      if (!student) {
        const matches =
          byName.get(`${row.nom.trim().toLowerCase()}|${row.prenom.trim().toLowerCase()}`) ?? [];
        if (matches.length === 1) {
          student = matches[0];
        } else if (matches.length > 1) {
          errors.push({
            row: row.sourceRow,
            message: `Plusieurs élèves nommés "${row.nom} ${row.prenom}" dans cette classe — indique le matricule pour lever l'ambiguïté. Ligne ignorée.`,
          });
          continue;
        }
      }
      if (!student) {
        errors.push({
          row: row.sourceRow,
          message: `Élève "${row.nom} ${row.prenom}"${row.matricule ? ` (matricule ${row.matricule})` : ''} introuvable dans cette classe — ligne ignorée.`,
        });
        continue;
      }

      for (const note of row.notes) {
        try {
          await prisma.grade.upsert({
            where: {
              studentId_subjectId_periode_anneeScolaire: {
                studentId: student.id,
                subjectId: note.subjectId,
                periode,
                anneeScolaire,
              },
            },
            update: { valeur: note.valeur, classId },
            create: {
              schoolId: requireSchoolId(auth.user.schoolId),
              studentId: student.id,
              subjectId: note.subjectId,
              classId,
              periode,
              anneeScolaire,
              valeur: note.valeur,
            },
          });
          imported++;
        } catch {
          errors.push({
            row: row.sourceRow,
            message: `Matière "${note.subjectNom}" : erreur lors de l'enregistrement — ignorée.`,
          });
        }
      }
    }

    return NextResponse.json(
      { imported, total: totalNotes, errors },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

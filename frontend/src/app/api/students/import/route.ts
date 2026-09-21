// POST /api/students/import — bulk-enroll students from an uploaded Excel
//      (.xlsx/.xls) or CSV file, all into one class + année scolaire chosen
//      once for the whole batch (see /students/import). Schools that already
//      keep their roster in Excel shouldn't have to retype every student one
//      by one — see src/lib/students-import-columns.ts for the expected
//      column layout, shared with the downloadable template
//      (GET /api/students/import/template) and the on-page format preview.
//      Gated to the 'students' menu — bulk-enrolling is the same
//      admin/direction action as POST /api/students, just batched.
//
// Rows are created one at a time rather than in a single transaction: a
// typo on row 12 of a 40-row roster shouldn't discard the 39 good rows, so
// bad rows are skipped and reported back instead of failing the batch.
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
import { nextMatricule } from '@/lib/server/students';
import { parseImportSheet, type ImportRowError } from '@/lib/students-import-columns';
import { getStudentCapacity } from '@/lib/server/billing/plan-limits';

const MAX_FILE_BYTES = 5_000_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;
    const schoolId = requireSchoolId(auth.user.schoolId);

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    const classId = form?.get('classId');
    const anneeScolaire = form?.get('anneeScolaire');

    if (
      !(file instanceof File) ||
      typeof classId !== 'string' ||
      !classId ||
      typeof anneeScolaire !== 'string' ||
      !anneeScolaire
    ) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Fichier, classe et année scolaire sont obligatoires.',
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

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: classId } });
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

    const { valid, errors: parseErrors } = parseImportSheet(rows);
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

    // Sequential on purpose: nextMatricule() is count-based, so concurrent
    // auto-generation within the same batch could hand out the same
    // matricule twice.
    const errors: ImportRowError[] = [...parseErrors];
    let imported = 0;

    // Plan cap: import only as many rows as the school still has room for,
    // rather than rejecting the whole batch — a 30-row file for a school
    // with 5 seats left should still enroll those 5 and clearly report the
    // rest as skipped due to the plan limit.
    const capacity = await getStudentCapacity(prisma, schoolId);
    const rowsToImport = valid.slice(0, capacity.remaining);
    const rowsOverCap = valid.slice(capacity.remaining);
    for (const row of rowsOverCap) {
      errors.push({
        row: row.sourceRow,
        message: `Forfait limité à ${capacity.limit} élèves — ligne ignorée. Passez au forfait Croissance pour inscrire plus d'élèves.`,
      });
    }

    for (const row of rowsToImport) {
      try {
        const matricule = row.matricule || (await nextMatricule(anneeScolaire));
        await prisma.student.create({
          data: {
            schoolId,
            matricule,
            nom: row.nom,
            prenom: row.prenom,
            ...(row.dateNaissance ? { dateNaissance: new Date(row.dateNaissance) } : {}),
            ...(row.lieuNaissance ? { lieuNaissance: row.lieuNaissance } : {}),
            ...(row.quartier ? { quartier: row.quartier } : {}),
            sexe: row.sexe,
            statut: row.statut,
            classId,
            anneeScolaire,
            ...(row.parentNom ? { parentNom: row.parentNom } : {}),
            ...(row.parentTelephone ? { parentTelephone: row.parentTelephone } : {}),
            ...(row.parentEmail ? { parentEmail: row.parentEmail } : {}),
          },
        });
        imported++;
      } catch (err) {
        const isUniqueClash =
          typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
        errors.push({
          row: row.sourceRow,
          message: isUniqueClash
            ? `Matricule "${row.matricule}" déjà utilisé — ligne ignorée.`
            : `Erreur lors de l'enregistrement — ligne ignorée.`,
        });
      }
    }

    return NextResponse.json(
      { imported, total: valid.length, errors },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

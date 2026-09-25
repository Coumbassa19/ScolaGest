// GET /api/students/export?classId=&search= — downloads the student list
//     shown on /students (same classId/search filters) as an .xlsx file,
//     one row per student, using the exact same column headers the import
//     side reads (src/lib/students-import-columns.ts) — so an export can be
//     edited and re-imported. Gated to the 'students' menu — this is a
//     students output reached from the /students page.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { writeSheetBuffer } from '@/lib/server/import/write-sheet';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { IMPORT_COLUMNS } from '@/lib/students-import-columns';

function formatDate(d: Date | null): string {
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId') || undefined;
    const search = searchParams.get('search')?.trim() || undefined;

    let className = 'Toutes_les_classes';
    if (classId) {
      const schoolClass = await prisma.schoolClass.findUnique({ where: { id: classId } });
      if (!schoolClass) {
        return NextResponse.json(
          { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      className = schoolClass.name;
    }

    const students = await prisma.student.findMany({
      where: {
        ...(classId ? { classId } : {}),
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

    const headerRow = [...IMPORT_COLUMNS.map((c) => c.header), 'Classe'];
    const dataRows = students.map((s) => [
      s.matricule,
      s.nom,
      s.prenom,
      formatDate(s.dateNaissance),
      s.sexe,
      s.lieuNaissance ?? '',
      s.quartier ?? '',
      s.statut,
      s.parentNom ?? '',
      s.parentTelephone ?? '',
      s.parentEmail ?? '',
      s.schoolClass.name,
    ]);

    const buffer = await writeSheetBuffer([headerRow, ...dataRows], {
      sheetName: 'Élèves',
      colWidth: 18,
    });

    const filename = `eleves-${className}.xlsx`.replace(/[^\w.-]+/g, '_');

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

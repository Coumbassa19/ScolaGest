// GET /api/grades/import/template — downloadable .xlsx starter file for
//     "Notes & Résultats > Importer (Excel)", with Matricule/Nom/Prénom plus
//     one column per subject currently in the system (see
//     src/lib/grades-import-columns.ts for the parser that reads this same
//     layout back), and one filled example row. Requires the 'grades' menu
//     — no TEACHER block, since the blank template itself carries nothing
//     scoped to a class/subject (the actual write path, POST
//     /api/grades/import, is where the TEACHER restriction lives).
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

    const subjects = await prisma.subject.findMany({
      orderBy: { nom: 'asc' },
      select: { nom: true },
    });

    const headerRow = ['Matricule', 'Nom', 'Prénom', ...subjects.map((s) => s.nom)];
    const exampleRow = ['', 'Diallo', 'Fatoumata', ...subjects.map(() => '14')];

    const sheet = XLSX.utils.aoa_to_sheet([headerRow, exampleRow]);
    sheet['!cols'] = headerRow.map(() => ({ wch: 18 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Notes');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="modele-import-notes.xlsx"',
        'x-request-id': ctx.requestId,
      },
    });
  });
}

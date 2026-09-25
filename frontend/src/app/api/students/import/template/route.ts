// GET /api/students/import/template — downloadable .xlsx starter file for
//     "Gestion des élèves > Importer des élèves", with the exact column
//     headers the import parser recognizes (see
//     src/lib/students-import-columns.ts) plus one filled example row, so a
//     school can just open it, replace the example with their real roster,
//     and re-upload it. Gated to the 'students' menu, same as the import it
//     feeds (POST /api/students/import) — it carries no student data itself,
//     but there's no reason to let it be fetched outside the import flow.
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;

    const headerRow = IMPORT_COLUMNS.map((c) => c.header);
    const exampleRow = IMPORT_COLUMNS.map((c) => c.example);

    const buffer = await writeSheetBuffer([headerRow, exampleRow], {
      sheetName: 'Élèves',
      colWidth: 24,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="modele-import-eleves.xlsx"',
        'x-request-id': ctx.requestId,
      },
    });
  });
}

// Shared Excel/CSV → raw-rows reader for the two bulk-import routes
// (grades/import, students/import) and their "download a template" siblings'
// export counterpart. Built on `exceljs` rather than `xlsx` (SheetJS) — the
// npm registry copy of xlsx (0.18.5) has known Prototype Pollution/ReDoS
// advisories with no fix published to npm (SheetJS only ships patches via
// their own CDN). exceljs is actively maintained on the npm registry.
//
// Produces the same shape the old `XLSX.utils.sheet_to_json(sheet, {header:
// 1, blankrows: false, defval: ''})` call did: one array per row, first row
// is headers, cells are raw values (string/number/Date/'') — the existing
// parseGradesSheet/parseImportSheet already defensively stringify every
// cell (see cellToString in grades-import-columns.ts), so this only needs
// to unwrap exceljs's richer cell-value shapes, not fully normalize them.
import 'server-only';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';

function unwrapCell(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    // Formula cell: { formula, result }
    if ('result' in value) return unwrapCell((value as { result: ExcelJS.CellValue }).result);
    // Hyperlink cell: { text, hyperlink }
    if ('text' in value) return (value as { text: unknown }).text;
    // Rich text cell: { richText: [{ text }, ...] }
    if ('richText' in value) {
      const runs = (value as { richText: { text: string }[] }).richText;
      return runs.map((r) => r.text).join('');
    }
  }
  return value;
}

/**
 * Reads the first worksheet of an uploaded .xlsx or .csv file into raw rows.
 * Throws on anything unreadable — callers should catch and return their own
 * INVALID_FILE response (matches the previous XLSX.read behavior).
 */
export async function readSheetRows(file: File): Promise<unknown[][]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();

  if (file.name.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    // exceljs's bundled .d.ts resolves the ambient `Buffer` type to a
    // structurally different shape than this project's @types/node emits
    // for Buffer.from() (a benign generic-parameter mismatch, not a
    // runtime issue — same underlying Node Buffer either way). `Readable`
    // above sidesteps it by not naming `Buffer` at all; `.xlsx.load` has
    // no such overload, so this one call needs an explicit `any` escape
    // hatch rather than fighting the two conflicting type instantiations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('empty workbook');

  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    // row.values is 1-indexed (values[0] is always undefined) — slice it
    // off to get a plain 0-indexed array matching column A, B, C...
    const values = row.values as ExcelJS.CellValue[];
    rows.push(values.slice(1).map(unwrapCell));
  });
  return rows;
}

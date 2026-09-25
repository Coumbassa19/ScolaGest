// Shared array-of-arrays → .xlsx buffer writer, used by the export/template
// routes (grades, students). See read-sheet.ts for why this is exceljs
// rather than xlsx (SheetJS).
import 'server-only';
import ExcelJS from 'exceljs';

export async function writeSheetBuffer(
  rows: unknown[][],
  opts: { sheetName: string; colWidth: number },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(opts.sheetName);
  for (const row of rows) sheet.addRow(row);
  const width = rows[0]?.length ?? 0;
  for (let i = 1; i <= width; i++) sheet.getColumn(i).width = opts.colWidth;
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

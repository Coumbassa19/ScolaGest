// Round-trip coverage for the exceljs-based sheet reader/writer that
// replaced `xlsx` (SheetJS) — see read-sheet.ts's header comment for why.
// Neither of these two modules had any test coverage before (nor did any of
// the 6 routes that use them), so this is new ground, not a migration of an
// existing suite.
import { describe, expect, it } from 'vitest';
import { readSheetRows } from './read-sheet';
import { writeSheetBuffer } from './write-sheet';

function fileFrom(buffer: Buffer, name: string): File {
  return new File([new Uint8Array(buffer)], name);
}

describe('writeSheetBuffer → readSheetRows round-trip', () => {
  it('round-trips a plain .xlsx (strings, numbers)', async () => {
    const header = ['Matricule', 'Nom', 'Prénom', 'Note'];
    const rows = [header, ['M001', 'Diallo', 'Fatoumata', 14], ['M002', 'Camara', 'Ousmane', 17.5]];
    const buffer = await writeSheetBuffer(rows, { sheetName: 'Notes', colWidth: 16 });
    const file = fileFrom(buffer, 'notes.xlsx');

    const readBack = await readSheetRows(file);

    expect(readBack[0]).toEqual(header);
    expect(readBack[1]).toEqual(['M001', 'Diallo', 'Fatoumata', 14]);
    expect(readBack[2]).toEqual(['M002', 'Camara', 'Ousmane', 17.5]);
  });

  it('reads a .csv file (comma-separated, quoted field with a comma)', async () => {
    const csv = 'Matricule,Nom,Prénom\nM001,"Diallo, Jr",Fatoumata\n';
    const file = fileFrom(Buffer.from(csv, 'utf8'), 'eleves.csv');

    const rows = await readSheetRows(file);

    expect(rows[0]).toEqual(['Matricule', 'Nom', 'Prénom']);
    expect(rows[1]).toEqual(['M001', 'Diallo, Jr', 'Fatoumata']);
  });

  it('preserves Date cells as JS Date objects (cellDates equivalent)', async () => {
    const buffer = await writeSheetBuffer(
      [
        ['Nom', 'DateNaissance'],
        ['Diallo', new Date('2010-05-03')],
      ],
      { sheetName: 'Élèves', colWidth: 18 },
    );
    const file = fileFrom(buffer, 'eleves.xlsx');

    const rows = await readSheetRows(file);

    expect(rows[1]?.[1]).toBeInstanceOf(Date);
    expect((rows[1]?.[1] as Date).toISOString().slice(0, 10)).toBe('2010-05-03');
  });

  it('throws on an unreadable/corrupt file (caller maps this to INVALID_FILE)', async () => {
    const file = fileFrom(Buffer.from('not a real xlsx file', 'utf8'), 'garbage.xlsx');
    await expect(readSheetRows(file)).rejects.toThrow();
  });

  it('skips fully blank rows (blankrows: false equivalent)', async () => {
    const buffer = await writeSheetBuffer(
      [
        ['Nom', 'Prénom'],
        ['Diallo', 'Fatoumata'],
      ],
      { sheetName: 'Élèves', colWidth: 16 },
    );
    const file = fileFrom(buffer, 'eleves.xlsx');

    const rows = await readSheetRows(file);

    expect(rows).toHaveLength(2);
  });
});

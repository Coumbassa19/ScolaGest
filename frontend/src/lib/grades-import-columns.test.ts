// Tests for the Excel/CSV grades import parser.
//
// Critical invariants under test:
//  - nom/prenom missing ⇒ row skipped, error reported
//  - a subject column that doesn't match a known subject ⇒ ignored, one
//    column-level warning (not per-row)
//  - an out-of-range or non-numeric note ⇒ that one note ignored, row still
//    imported with the rest of its valid notes
//  - blank rows are silently skipped
//  - an empty cell for a subject means "no grade entered", not an error
import { describe, it, expect } from 'vitest';
import { parseGradesSheet, type GradeImportSubject } from './grades-import-columns';

const SUBJECTS: GradeImportSubject[] = [
  { id: 'sub-chimie', nom: 'Chimie' },
  { id: 'sub-francais', nom: 'Français' },
];

const HEADER_ROW = ['Matricule', 'Nom', 'Prénom', 'Chimie', 'Français'];

describe('parseGradesSheet', () => {
  it('parses a fully-filled row', () => {
    const { valid, errors } = parseGradesSheet(
      [HEADER_ROW, ['ELE-2024-001', 'Diallo', 'Fatoumata', '14', '16']],
      SUBJECTS,
    );
    expect(errors).toEqual([]);
    expect(valid).toEqual([
      {
        sourceRow: 2,
        matricule: 'ELE-2024-001',
        nom: 'Diallo',
        prenom: 'Fatoumata',
        notes: [
          { subjectId: 'sub-chimie', subjectNom: 'Chimie', valeur: 14 },
          { subjectId: 'sub-francais', subjectNom: 'Français', valeur: 16 },
        ],
      },
    ]);
  });

  it('treats an empty subject cell as "not graded yet", not an error', () => {
    const { valid, errors } = parseGradesSheet(
      [HEADER_ROW, ['', 'Bah', 'Aissatou', '15', '']],
      SUBJECTS,
    );
    expect(errors).toEqual([]);
    expect(valid).toEqual([
      {
        sourceRow: 2,
        matricule: undefined,
        nom: 'Bah',
        prenom: 'Aissatou',
        notes: [{ subjectId: 'sub-chimie', subjectNom: 'Chimie', valeur: 15 }],
      },
    ]);
  });

  it('skips a row missing nom or prenom and reports it', () => {
    const { valid, errors } = parseGradesSheet(
      [HEADER_ROW, ['', '', 'Aissatou', '15', '']],
      SUBJECTS,
    );
    expect(valid).toEqual([]);
    expect(errors).toEqual([{ row: 2, message: expect.stringContaining('obligatoires') }]);
  });

  it('silently skips fully blank rows', () => {
    const { valid, errors } = parseGradesSheet(
      [HEADER_ROW, ['', '', '', '', ''], ['', 'Bah', 'Aissatou', '12', '']],
      SUBJECTS,
    );
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
  });

  it('flags an out-of-range note but still imports the row with the other valid notes', () => {
    const { valid, errors } = parseGradesSheet(
      [HEADER_ROW, ['', 'Bah', 'Aissatou', '25', '12']],
      SUBJECTS,
    );
    expect(valid).toEqual([
      {
        sourceRow: 2,
        matricule: undefined,
        nom: 'Bah',
        prenom: 'Aissatou',
        notes: [{ subjectId: 'sub-francais', subjectNom: 'Français', valeur: 12 }],
      },
    ]);
    expect(errors).toEqual([
      { row: 2, message: expect.stringContaining('Chimie" : note "25" invalide') },
    ]);
  });

  it('flags a non-numeric note the same way', () => {
    const { valid, errors } = parseGradesSheet(
      [HEADER_ROW, ['', 'Bah', 'Aissatou', 'abc', '']],
      SUBJECTS,
    );
    expect(valid[0]?.notes).toEqual([]);
    expect(errors).toEqual([
      { row: 2, message: expect.stringContaining('Chimie" : note "abc" invalide') },
    ]);
  });

  it('warns once about an unrecognized subject column, not per row', () => {
    const { valid, errors } = parseGradesSheet(
      [
        ['Matricule', 'Nom', 'Prénom', 'Chimie', 'Histoire'],
        ['', 'Bah', 'Aissatou', '12', '10'],
        ['', 'Camara', 'Ibrahima', '14', '9'],
      ],
      SUBJECTS,
    );
    expect(errors).toEqual([{ row: 1, message: expect.stringContaining('Histoire" ignorée') }]);
    expect(valid).toHaveLength(2);
    expect(valid[0]?.notes).toEqual([
      { subjectId: 'sub-chimie', subjectNom: 'Chimie', valeur: 12 },
    ]);
  });

  it('reports an error and returns nothing when Nom/Prénom headers are missing', () => {
    const { valid, errors } = parseGradesSheet(
      [
        ['col1', 'col2'],
        ['x', 'y'],
      ],
      SUBJECTS,
    );
    expect(valid).toEqual([]);
    expect(errors).toEqual([{ row: 1, message: expect.stringContaining('introuvables') }]);
  });

  it('returns nothing for an empty sheet', () => {
    expect(parseGradesSheet([], SUBJECTS)).toEqual({ valid: [], errors: [] });
  });
});

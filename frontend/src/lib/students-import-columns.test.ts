// Tests for the Excel/CSV student import parser.
//
// Critical invariants under test:
//  - nom/prenom missing ⇒ row skipped, error reported
//  - invalid sexe/statut/date/email ⇒ field ignored (default applied) but
//    row still imported, error reported
//  - blank rows are silently skipped (no error)
//  - unrecognized headers fall back to the template's column order
import { describe, it, expect } from 'vitest';
import { normalizeHeader, parseImportSheet } from './students-import-columns';

const HEADER_ROW = [
  'Matricule',
  'Nom',
  'Prénom',
  'Date de naissance (JJ/MM/AAAA)',
  'Sexe (M ou F)',
  'Ville',
  'Quartier',
  'Statut (NOUVEAU ou ANCIEN)',
  'Nom du parent',
  'Téléphone du parent',
  'Email du parent',
];

describe('normalizeHeader', () => {
  it('strips accents, parenthetical hints, and case', () => {
    expect(normalizeHeader('Sexe (M ou F)')).toBe('sexe');
    expect(normalizeHeader('Téléphone du parent')).toBe('telephone du parent');
    expect(normalizeHeader('  Nom  ')).toBe('nom');
  });
});

describe('parseImportSheet', () => {
  it('parses a fully-filled row', () => {
    const { valid, errors } = parseImportSheet([
      HEADER_ROW,
      [
        'ELE-2024-099',
        'Diallo',
        'Fatoumata',
        '15/03/2012',
        'F',
        'Conakry',
        'Dixinn',
        'ANCIEN',
        'Mamadou Diallo',
        '622000000',
        'parent@email.com',
      ],
    ]);
    expect(errors).toEqual([]);
    expect(valid).toEqual([
      {
        sourceRow: 2,
        matricule: 'ELE-2024-099',
        nom: 'Diallo',
        prenom: 'Fatoumata',
        dateNaissance: '2012-03-15',
        sexe: 'F',
        ville: 'Conakry',
        quartier: 'Dixinn',
        statut: 'ANCIEN',
        parentNom: 'Mamadou Diallo',
        parentTelephone: '622000000',
        parentEmail: 'parent@email.com',
      },
    ]);
  });

  it('applies defaults for a minimal row (only nom/prenom)', () => {
    const { valid, errors } = parseImportSheet([HEADER_ROW, ['', 'Bah', 'Aissatou']]);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({
      nom: 'Bah',
      prenom: 'Aissatou',
      sexe: 'M',
      statut: 'NOUVEAU',
    });
  });

  it('skips a row missing nom or prenom and reports it', () => {
    const { valid, errors } = parseImportSheet([HEADER_ROW, ['', '', 'Aissatou'], ['', 'Bah', '']]);
    expect(valid).toEqual([]);
    expect(errors).toEqual([
      { row: 2, message: expect.stringContaining('obligatoires') },
      { row: 3, message: expect.stringContaining('obligatoires') },
    ]);
  });

  it('silently skips fully blank rows', () => {
    const { valid, errors } = parseImportSheet([
      HEADER_ROW,
      ['', '', '', '', '', '', '', '', '', '', ''],
      ['', 'Bah', 'Aissatou'],
    ]);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
  });

  it('flags an invalid sexe but still imports the row with the M default', () => {
    const { valid, errors } = parseImportSheet([HEADER_ROW, ['', 'Bah', 'Aissatou', '', 'X']]);
    expect(valid).toHaveLength(1);
    expect(valid[0]?.sexe).toBe('M');
    expect(errors).toEqual([{ row: 2, message: expect.stringContaining('Sexe "X" invalide') }]);
  });

  it('flags an invalid statut but still imports the row with the NOUVEAU default', () => {
    const { valid, errors } = parseImportSheet([
      HEADER_ROW,
      ['', 'Bah', 'Aissatou', '', '', '', '', 'GRADUE'],
    ]);
    expect(valid).toHaveLength(1);
    expect(valid[0]?.statut).toBe('NOUVEAU');
    expect(errors).toEqual([
      { row: 2, message: expect.stringContaining('Statut "GRADUE" invalide') },
    ]);
  });

  it('flags an invalid date but still imports the row without one', () => {
    const { valid, errors } = parseImportSheet([
      HEADER_ROW,
      ['', 'Bah', 'Aissatou', 'pas une date'],
    ]);
    expect(valid).toHaveLength(1);
    expect(valid[0]?.dateNaissance).toBeUndefined();
    expect(errors).toEqual([
      { row: 2, message: expect.stringContaining('Date de naissance "pas une date" invalide') },
    ]);
  });

  it('flags an invalid parent email but still imports the row without one', () => {
    const { valid, errors } = parseImportSheet([
      HEADER_ROW,
      ['', 'Bah', 'Aissatou', '', '', '', '', '', '', '', 'pas-un-email'],
    ]);
    expect(valid).toHaveLength(1);
    expect(valid[0]?.parentEmail).toBeUndefined();
    expect(errors).toEqual([
      { row: 2, message: expect.stringContaining('Email du parent "pas-un-email" invalide') },
    ]);
  });

  it('falls back to positional column order when there is no recognizable header row', () => {
    // No header row at all — first row is already data, in the template's
    // column order (matricule, nom, prenom, ...).
    const { valid, errors } = parseImportSheet([['', 'Bah', 'Aissatou']]);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({ nom: 'Bah', prenom: 'Aissatou' });
  });

  it('returns nothing for an empty sheet', () => {
    expect(parseImportSheet([])).toEqual({ valid: [], errors: [] });
  });
});

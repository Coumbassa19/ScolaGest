// Parsing for the Excel/CSV grades import on /grades > "Importer (Excel)".
// Unlike enter-grades (one subject at a time), the import sheet has one
// column per subject so a whole class/period can be graded in one upload —
// see src/components/forms/ImportGradesForm.tsx and
// src/app/api/grades/import/route.ts.
//
// Pure data + parsing logic (no prisma/xlsx dependency), safe to import from
// both a client component (format preview table) and a server route
// (template + import parsing). Student matching (matricule/nom/prenom →
// studentId) needs the DB, so it happens in the API route, not here — this
// module only turns spreadsheet rows into a structured, subject-resolved
// shape.

import { normalizeHeader } from './students-import-columns';

export interface GradeImportSubject {
  id: string;
  nom: string;
}

export interface GradeImportNote {
  subjectId: string;
  subjectNom: string;
  valeur: number;
}

export interface GradeImportRow {
  /** 1-based row number as it appears in the spreadsheet, for error reporting. */
  sourceRow: number;
  matricule?: string | undefined;
  nom: string;
  prenom: string;
  notes: GradeImportNote[];
}

export interface GradeImportRowError {
  row: number;
  message: string;
}

function cellToString(cell: unknown): string {
  if (cell === undefined || cell === null) return '';
  return String(cell).trim();
}

export function parseGradesSheet(
  rows: unknown[][],
  subjects: GradeImportSubject[],
  /** Grading scale ("noté sur") of the target class's cycle — see Cycles. */
  maxNote = 20,
): { valid: GradeImportRow[]; errors: GradeImportRowError[] } {
  const errors: GradeImportRowError[] = [];
  const valid: GradeImportRow[] = [];
  if (rows.length === 0) return { valid, errors };

  const headerRow = rows[0] ?? [];
  const normalizedHeaders = headerRow.map((h) => normalizeHeader(cellToString(h)));

  const matriculeIdx = normalizedHeaders.findIndex((h) => h === 'matricule');
  const nomIdx = normalizedHeaders.findIndex((h) => h === 'nom');
  const prenomIdx = normalizedHeaders.findIndex((h) => h === 'prenom' || h === 'prénom');

  if (nomIdx === -1 || prenomIdx === -1) {
    errors.push({
      row: 1,
      message:
        'Colonnes "Nom" et/ou "Prénom" introuvables dans l\'en-tête — impossible de lire le fichier.',
    });
    return { valid, errors };
  }

  // Map each recognized subject column to its subject, and warn once (not
  // per-row) about any subject column that doesn't match a known subject —
  // a typo or a subject that's since been renamed/removed.
  const subjectByNormalizedNom = new Map(subjects.map((s) => [normalizeHeader(s.nom), s]));
  const subjectColumns: { index: number; subject: GradeImportSubject }[] = [];
  const reservedIdx = new Set([matriculeIdx, nomIdx, prenomIdx]);
  normalizedHeaders.forEach((h, idx) => {
    if (reservedIdx.has(idx) || !h) return;
    const subject = subjectByNormalizedNom.get(h);
    if (subject) {
      subjectColumns.push({ index: idx, subject });
    } else {
      errors.push({
        row: 1,
        message: `Colonne "${headerRow[idx]}" ignorée — aucune matière correspondante.`,
      });
    }
  });

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const sourceRow = r + 1;
    if (!row || row.every((cell) => cellToString(cell) === '')) continue; // skip blank rows

    const nom = cellToString(row[nomIdx]);
    const prenom = cellToString(row[prenomIdx]);
    if (!nom || !prenom) {
      errors.push({ row: sourceRow, message: 'Nom et prénom sont obligatoires — ligne ignorée.' });
      continue;
    }

    const notes: GradeImportNote[] = [];
    for (const { index, subject } of subjectColumns) {
      const raw = cellToString(row[index]);
      if (!raw) continue; // no grade entered for this subject — fine, skip
      // Accepts a comma as the decimal separator too (e.g. "14,5") — common
      // when a cell was typed by hand rather than read from a real Excel
      // number, which XLSX already parses correctly regardless of locale.
      const valeur = Number(raw.replace(',', '.'));
      if (!Number.isFinite(valeur) || valeur < 0 || valeur > maxNote) {
        errors.push({
          row: sourceRow,
          message: `Matière "${subject.nom}" : note "${raw}" invalide (attendu un nombre de 0 à ${maxNote}) — ignorée.`,
        });
        continue;
      }
      notes.push({
        subjectId: subject.id,
        subjectNom: subject.nom,
        valeur: Math.round(valeur * 10) / 10,
      });
    }

    valid.push({
      sourceRow,
      matricule: matriculeIdx !== -1 ? cellToString(row[matriculeIdx]) || undefined : undefined,
      nom,
      prenom,
      notes,
    });
  }

  return { valid, errors };
}

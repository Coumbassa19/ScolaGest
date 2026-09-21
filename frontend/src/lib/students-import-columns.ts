// Column spec shared between the Excel import parser (server) and the
// on-page format preview + template download (client) for "Gestion des
// élèves > Importer des élèves". classId/anneeScolaire/photo are chosen
// once for the whole batch in the import form, not per-row, so they're not
// columns here — everything else on the Student form is.
//
// Pure data + parsing logic, no prisma/fs/xlsx dependency, so it's safe to
// import from both a client component (to render the format preview table)
// and a server route (to build the template file and parse uploads).

export interface ImportColumn {
  key:
    | 'matricule'
    | 'nom'
    | 'prenom'
    | 'dateNaissance'
    | 'sexe'
    | 'lieuNaissance'
    | 'quartier'
    | 'statut'
    | 'parentNom'
    | 'parentTelephone'
    | 'parentEmail';
  header: string;
  required: boolean;
  example: string;
  /** Extra normalized (see normalizeHeader) header variants accepted on import. */
  aliases: string[];
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    key: 'matricule',
    header: 'Matricule',
    required: false,
    example: '',
    aliases: ['matricule', 'numero matricule', 'id eleve'],
  },
  { key: 'nom', header: 'Nom', required: true, example: 'Diallo', aliases: ['nom'] },
  {
    key: 'prenom',
    header: 'Prénom',
    required: true,
    example: 'Fatoumata',
    aliases: ['prenom'],
  },
  {
    key: 'dateNaissance',
    header: 'Date de naissance (JJ/MM/AAAA)',
    required: false,
    example: '15/03/2012',
    aliases: ['date de naissance', 'date naissance', 'naissance'],
  },
  {
    key: 'sexe',
    header: 'Sexe (M ou F)',
    required: false,
    example: 'F',
    aliases: ['sexe', 'genre'],
  },
  {
    key: 'lieuNaissance',
    header: 'Lieu de naissance',
    required: false,
    example: 'Conakry',
    aliases: ['lieu de naissance', 'lieu naissance', 'ville'],
  },
  {
    key: 'quartier',
    header: 'Quartier',
    required: false,
    example: 'Dixinn',
    aliases: ['quartier'],
  },
  {
    key: 'statut',
    header: 'Statut (NOUVEAU ou ANCIEN)',
    required: false,
    example: 'NOUVEAU',
    aliases: ['statut', 'statut eleve'],
  },
  {
    key: 'parentNom',
    header: 'Nom du parent',
    required: false,
    example: 'Mamadou Diallo',
    aliases: ['nom du parent', 'nom parent', 'parent', 'nom du tuteur'],
  },
  {
    key: 'parentTelephone',
    header: 'Téléphone du parent',
    required: false,
    example: '622 00 00 00',
    aliases: [
      'telephone du parent',
      'telephone parent',
      'tel parent',
      'numero du parent',
      'numero parent',
      'contact parent',
    ],
  },
  {
    key: 'parentEmail',
    header: 'Email du parent',
    required: false,
    example: 'parent@email.com',
    aliases: ['email du parent', 'email parent', 'mail du parent', 'mail parent', 'e-mail parent'],
  },
];

export interface ParsedStudentRow {
  /** 1-based row number as it appears in the spreadsheet, for error reporting. */
  sourceRow: number;
  matricule?: string | undefined;
  nom: string;
  prenom: string;
  dateNaissance?: string | undefined; // ISO "YYYY-MM-DD"
  sexe: 'M' | 'F';
  lieuNaissance?: string | undefined;
  quartier?: string | undefined;
  statut: 'NOUVEAU' | 'ANCIEN';
  parentNom?: string | undefined;
  parentTelephone?: string | undefined;
  parentEmail?: string | undefined;
}

export interface ImportRowError {
  row: number;
  message: string;
}

/** lowercase, accent-stripped, parenthetical-hint-stripped, trimmed — so
 * "Sexe (M ou F)" and "sexe" both normalize to "sexe". */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim();
}

function cellToString(cell: unknown): string {
  if (cell === undefined || cell === null) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** Returns an ISO "YYYY-MM-DD" date, undefined for an empty cell, or
 * 'INVALID' for a non-empty cell that couldn't be parsed as a date. */
function parseCellDate(cell: unknown): string | undefined | 'INVALID' {
  if (cell === undefined || cell === null || cell === '') return undefined;
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return cell.toISOString().slice(0, 10);
  }
  const s = String(cell).trim();
  if (!s) return undefined;

  // JJ/MM/AAAA or JJ-MM-AAAA (the format the template uses).
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m as unknown as [string, string, string, string];
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (Number.isNaN(date.getTime())) return 'INVALID';
    return date.toISOString().slice(0, 10);
  }

  // ISO AAAA-MM-JJ, in case a spreadsheet tool normalized it.
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m as unknown as [string, string, string, string];
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (Number.isNaN(date.getTime())) return 'INVALID';
    return date.toISOString().slice(0, 10);
  }

  return 'INVALID';
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function parseImportSheet(rows: unknown[][]): {
  valid: ParsedStudentRow[];
  errors: ImportRowError[];
} {
  const errors: ImportRowError[] = [];
  const valid: ParsedStudentRow[] = [];
  if (rows.length === 0) return { valid, errors };

  const headerRow = rows[0] ?? [];
  const normalizedHeaders = headerRow.map((h) => normalizeHeader(cellToString(h)));

  const colIndex = new Map<string, number>();
  for (const col of IMPORT_COLUMNS) {
    const idx = normalizedHeaders.findIndex(
      (h) => h === normalizeHeader(col.header) || col.aliases.includes(h),
    );
    if (idx !== -1) colIndex.set(col.key, idx);
  }

  // If we can't even find "nom"/"prenom" by header name, assume the sheet
  // has no header row (or unrecognized ones) and fall back to the
  // template's column order, starting from the first row instead of the
  // second.
  const headersRecognized = colIndex.has('nom') && colIndex.has('prenom');
  let dataStart = 1;
  if (!headersRecognized) {
    IMPORT_COLUMNS.forEach((col, i) => colIndex.set(col.key, i));
    dataStart = 0;
  }

  const get = (row: unknown[], key: string): unknown => {
    const idx = colIndex.get(key);
    if (idx === undefined) return undefined;
    return row[idx];
  };

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    const sourceRow = r + 1;
    if (!row || row.every((cell) => cellToString(cell) === '')) continue; // skip blank rows

    const nom = cellToString(get(row, 'nom'));
    const prenom = cellToString(get(row, 'prenom'));
    if (!nom || !prenom) {
      errors.push({ row: sourceRow, message: 'Nom et prénom sont obligatoires — ligne ignorée.' });
      continue;
    }

    let sexe: 'M' | 'F' = 'M';
    const rawSexe = cellToString(get(row, 'sexe'));
    if (rawSexe) {
      const s = rawSexe.toUpperCase();
      if (s === 'M' || s === 'F') sexe = s;
      else
        errors.push({
          row: sourceRow,
          message: `Sexe "${rawSexe}" invalide (attendu M ou F) — "M" appliqué par défaut.`,
        });
    }

    let statut: 'NOUVEAU' | 'ANCIEN' = 'NOUVEAU';
    const rawStatut = cellToString(get(row, 'statut'));
    if (rawStatut) {
      const s = rawStatut.toUpperCase();
      if (s === 'NOUVEAU' || s === 'ANCIEN') statut = s;
      else
        errors.push({
          row: sourceRow,
          message: `Statut "${rawStatut}" invalide (attendu NOUVEAU ou ANCIEN) — "NOUVEAU" appliqué par défaut.`,
        });
    }

    let dateNaissance: string | undefined;
    const rawDate = get(row, 'dateNaissance');
    const parsedDate = parseCellDate(rawDate);
    if (parsedDate === 'INVALID') {
      errors.push({
        row: sourceRow,
        message: `Date de naissance "${cellToString(rawDate)}" invalide — ignorée (format attendu JJ/MM/AAAA).`,
      });
    } else {
      dateNaissance = parsedDate;
    }

    let parentEmail: string | undefined;
    const rawEmail = cellToString(get(row, 'parentEmail'));
    if (rawEmail) {
      if (EMAIL_RE.test(rawEmail)) parentEmail = rawEmail;
      else
        errors.push({
          row: sourceRow,
          message: `Email du parent "${rawEmail}" invalide — ignoré.`,
        });
    }

    valid.push({
      sourceRow,
      matricule: cellToString(get(row, 'matricule')) || undefined,
      nom,
      prenom,
      dateNaissance,
      sexe,
      lieuNaissance: cellToString(get(row, 'lieuNaissance')) || undefined,
      quartier: cellToString(get(row, 'quartier')) || undefined,
      statut,
      parentNom: cellToString(get(row, 'parentNom')) || undefined,
      parentTelephone: cellToString(get(row, 'parentTelephone')) || undefined,
      parentEmail,
    });
  }

  return { valid, errors };
}

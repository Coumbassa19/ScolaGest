'use client';

// "Importer (Excel)" form on /grades/import. One file grades a whole
// class/period/year across every subject at once — see
// src/lib/grades-import-columns.ts for the column layout this shares with
// the downloadable template and the preview table below.

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface ImportGradeClassOption {
  id: string;
  name: string;
}

export interface ImportGradeSubjectOption {
  id: string;
  nom: string;
}

const PERIODE_VALUES = ['T1', 'T2', 'T3'] as const;
const ASSESSMENT_TYPES = ['DEVOIR', 'COMPOSITION'] as const;
type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

interface ImportResult {
  imported: number;
  total: number;
  errors: { row: number; message: string }[];
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

// Maps the stable `error` codes /api/grades/import can return to the
// matching translation key in `grades.importForm`, so a server error always
// reads in the app's current language instead of leaking the raw string
// the route returns. VALIDATION_FAILED isn't mapped: the form already
// requires a class and a file before submit, so it falls back to
// err.message like any other unexpected code.
const ERROR_KEYS: Record<string, string> = {
  FORBIDDEN: 'errorForbidden',
  FILE_TOO_LARGE: 'errorFileTooLarge',
  CLASS_NOT_FOUND: 'errorClassNotFound',
  INVALID_FILE: 'errorInvalidFile',
  NO_VALID_ROWS: 'errorNoValidRows',
};

export default function ImportGradesForm({
  classes,
  academicYears,
  subjects,
}: {
  classes: ImportGradeClassOption[];
  academicYears: string[];
  subjects: ImportGradeSubjectOption[];
}) {
  const t = useTranslations('grades.importForm');
  const tp = useTranslations('grades.periods');
  // Reuses the type/label copy from the manual entry form (same meaning,
  // same wording an admin already saw once there) instead of duplicating it.
  const tEnter = useTranslations('grades.enterForm');
  const PERIODES = PERIODE_VALUES.map((value) => ({ value, label: tp(value) }));
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [periode, setPeriode] = useState('T1');
  const [anneeScolaire, setAnneeScolaire] = useState(academicYears[0] ?? '2024-2025');
  // Defaults to COMPOSITION — a one-off import is most often the end-of-
  // term composition sheet; devoirs are usually entered class-by-class via
  // /enter-grades. See src/lib/server/grades/moyenne.ts.
  const [type, setType] = useState<AssessmentType>('COMPOSITION');
  const [label, setLabel] = useState('Composition');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!classId) {
      setError(t('errorSelectClass'));
      return;
    }
    if (!file) {
      setError(t('errorSelectFile'));
      return;
    }
    if (type === 'DEVOIR' && !label.trim()) {
      setError(tEnter('errorLabelRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('classId', classId);
      body.set('periode', periode);
      body.set('anneeScolaire', anneeScolaire);
      body.set('type', type);
      body.set('label', type === 'COMPOSITION' ? 'Composition' : label.trim());
      const data = await api<ImportResult>('/api/grades/import', { method: 'POST', body });
      setResult(data);
      toast(t('importedSummary', { imported: data.imported, total: data.total }), 'success');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.refresh();
    } catch (err) {
      let message = t('errorNetwork');
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        message = key ? t(key as never) : err.message;
      }
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const previewColumns = ['Matricule', 'Nom', 'Prénom', ...subjects.map((s) => s.nom)];
  const previewExample = ['', 'Diallo', 'Fatoumata', ...subjects.map(() => '14')];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Section: format preview */}
      <div className="bg-surface rounded-lg border border-border px-6 py-5">
        <div className="mb-4 pb-4 border-b border-border">
          <h2 className="text-lg font-headings font-semibold text-foreground">
            {t('expectedFormatTitle')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('expectedFormatSubtitle')}</p>
        </div>

        {subjects.length === 0 ? (
          <p className="text-sm text-warning">{t('noSubjects')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full border-collapse text-sm">
              <thead>
                <tr>
                  {previewColumns.map((c, i) => (
                    <th
                      key={i}
                      className="border border-border bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                    >
                      {c}
                      {(c === 'Nom' || c === 'Prénom') && <span className="text-danger"> *</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {previewExample.map((v, i) => (
                    <td
                      key={i}
                      className="border border-border px-3 py-2 text-foreground whitespace-nowrap"
                    >
                      {v || <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          <span className="text-danger">*</span> {t('requiredColumnsHint')}
        </p>

        <a
          href="/api/grades/import/template"
          className="inline-block mt-4 px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-background hover:bg-input"
        >
          {t('downloadTemplate')}
        </a>
      </div>

      {/* Section: upload */}
      <form onSubmit={onSubmit} className="bg-surface rounded-lg border border-border px-6 py-5">
        <div className="mb-4 pb-4 border-b border-border">
          <h2 className="text-lg font-headings font-semibold text-foreground">
            {t('uploadSectionTitle')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('uploadSectionSubtitle')}</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {tEnter('typeLabel')}
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const next = e.target.value as AssessmentType;
                  setType(next);
                  setLabel(next === 'COMPOSITION' ? 'Composition' : '');
                }}
                className={fieldClass}
              >
                {ASSESSMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {tEnter(value === 'DEVOIR' ? 'typeDevoir' : 'typeComposition')}
                  </option>
                ))}
              </select>
            </div>
            {type === 'DEVOIR' && (
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  {tEnter('labelFieldLabel')}
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={tEnter('labelFieldPlaceholder')}
                  className={fieldClass}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('classLabel')}
              </label>
              {classes.length === 0 ? (
                <p className="text-sm text-danger">{t('noClasses')}</p>
              ) : (
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  required
                  className={fieldClass}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('periodLabel')}
              </label>
              <select
                value={periode}
                onChange={(e) => setPeriode(e.target.value)}
                className={fieldClass}
              >
                {PERIODES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('yearLabel')}
              </label>
              <select
                value={anneeScolaire}
                onChange={(e) => setAnneeScolaire(e.target.value)}
                className={fieldClass}
              >
                {academicYears.length === 0 && (
                  <option value={anneeScolaire}>{anneeScolaire}</option>
                )}
                {academicYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('fileLabel')}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFileChange}
              className="block w-full text-sm text-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-border file:bg-surface file:text-sm file:font-semibold file:cursor-pointer"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          {result && (
            <div className="rounded-md border border-border bg-background px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-success">
                {t('importedSummary', { imported: result.imported, total: result.total })}
              </p>
              {result.errors.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-warning uppercase tracking-wider mb-1">
                    {t('warningsSummary', { count: result.errors.length })}
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    {result.errors.map((e, i) => (
                      <li key={i}>{t('rowLabel', { row: e.row, message: e.message })}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || classes.length === 0 || subjects.length === 0}
              className="px-6 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-md disabled:opacity-50"
            >
              {submitting ? t('submitting') : t('submit')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

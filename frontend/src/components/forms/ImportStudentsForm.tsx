'use client';

// "Importer des élèves" form on /students/import. Schools that already
// track their roster in Excel upload it here instead of retyping every
// student — see src/lib/students-import-columns.ts for the column layout
// this shares with the downloadable template and the preview table below.

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { IMPORT_COLUMNS } from '@/lib/students-import-columns';
import { useToast } from '@/contexts/ToastContext';

export interface ImportClassOption {
  id: string;
  name: string;
}

interface ImportResult {
  imported: number;
  total: number;
  errors: { row: number; message: string }[];
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

// Maps the stable `error` codes /api/students/import can return to the
// matching translation key in `students.importForm`, so a server error
// always reads in the app's current language instead of leaking the raw
// string the route returns. VALIDATION_FAILED isn't mapped: the form
// already requires a class and a file before submit, so it falls back to
// err.message like any other unexpected code.
const ERROR_KEYS: Record<string, string> = {
  FILE_TOO_LARGE: 'errorFileTooLarge',
  CLASS_NOT_FOUND: 'errorClassNotFound',
  INVALID_FILE: 'errorInvalidFile',
  NO_VALID_ROWS: 'errorNoValidRows',
};

export default function ImportStudentsForm({
  classes,
  academicYears,
}: {
  classes: ImportClassOption[];
  academicYears: string[];
}) {
  const router = useRouter();
  const t = useTranslations('students.importForm');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [anneeScolaire, setAnneeScolaire] = useState(academicYears[0] ?? '2024-2025');
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

    setSubmitting(true);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('classId', classId);
      body.set('anneeScolaire', anneeScolaire);
      const data = await api<ImportResult>('/api/students/import', { method: 'POST', body });
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

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-collapse text-sm">
            <thead>
              <tr>
                {IMPORT_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className="border border-border bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                  >
                    {c.header}
                    {c.required && <span className="text-danger"> *</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {IMPORT_COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className="border border-border px-3 py-2 text-foreground whitespace-nowrap"
                  >
                    {c.example || <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          <span className="text-danger">*</span> {t('requiredColumnsHint')}
        </p>

        <a
          href="/api/students/import/template"
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
                {t('academicYearLabel')}
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
                    {year.replace('-', ' - ')}
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
              disabled={submitting || classes.length === 0}
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

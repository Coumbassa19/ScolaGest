'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface ClassOption {
  id: string;
  name: string;
}

interface StudentResult {
  id: string;
  nom: string;
  prenom: string;
  anneeScolaire: string;
  schoolClass: { name: string };
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-input text-foreground text-sm placeholder-muted-foreground';

export default function ReregisterStudentForm({
  classes,
  academicYears,
}: {
  classes: ClassOption[];
  /** Labels, e.g. ["2026-2027", "2025-2026", ...], most recent first. */
  academicYears: string[];
}) {
  const router = useRouter();
  const t = useTranslations('students.reregister');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<StudentResult | null>(null);
  const [anneeScolaire, setAnneeScolaire] = useState(academicYears[0] ?? '2024-2025');
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Shown proactively (not just after a failed submit) whenever the
  // selected year is still the student's current year — the year select
  // defaults to it and keeps it grayed out rather than jumping to another
  // year, so this warning is what actually stops an inattentive click on
  // "Réinscrire" from going through.
  const sameYearBlocked = !!selected && anneeScolaire === selected.anneeScolaire;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api<{ students: StudentResult[] }>(
          `/api/students?search=${encodeURIComponent(query.trim())}`,
        );
        setResults(data.students);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError(t('errorSelectStudent'));
      return;
    }
    if (!classId) {
      setError(t('errorSelectClass'));
      return;
    }
    if (anneeScolaire === selected.anneeScolaire) {
      setError(t('errorSameYear', { year: selected.anneeScolaire }));
      return;
    }
    setSubmitting(true);
    try {
      await api(`/api/students/${selected.id}`, {
        method: 'PATCH',
        body: { classId, anneeScolaire, statut: 'ANCIEN' },
      });
      toast(tCommon('updatedToast'), 'success');
      router.push('/students');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      {/* Section: Rechercher élève */}
      <div className="bg-surface rounded-lg border border-border px-6 py-5">
        <div className="mb-4 pb-4 border-b border-border">
          <h2 className="text-lg font-headings font-semibold text-foreground">
            {t('searchSectionTitle')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('searchSectionSubtitle')}</p>
        </div>

        <div className="space-y-4">
          {/* Search input */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('nameLabel')}
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder={t('searchPlaceholder')}
              className={fieldClass}
            />
          </div>

          {/* Results list */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('resultsLabel')}
            </label>
            <div className="border border-border rounded-md divide-y max-h-48 overflow-y-auto">
              {searching && (
                <div className="px-3 py-2 text-sm text-muted-foreground">{t('searching')}</div>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">{t('noResults')}</div>
              )}
              {results.map((student) => (
                <button
                  type="button"
                  key={student.id}
                  onClick={() => setSelected(student)}
                  className={`w-full px-3 py-2 text-left hover:bg-input ${
                    selected?.id === student.id ? 'bg-secondary' : ''
                  }`}
                >
                  <div className="text-sm font-semibold text-foreground">
                    {student.nom} {student.prenom}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {student.schoolClass.name} • {student.anneeScolaire}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section: Détails Réinscription */}
      <div className="bg-surface rounded-lg border border-border px-6 py-5">
        <div className="mb-4 pb-4 border-b border-border">
          <h2 className="text-lg font-headings font-semibold text-foreground">
            {t('detailsSectionTitle')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('detailsSectionSubtitle')}</p>
        </div>

        <div className="space-y-4">
          {/* Année scolaire */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('academicYearLabel')}
            </label>
            <select
              value={anneeScolaire}
              onChange={(e) => setAnneeScolaire(e.target.value)}
              className="border border-border rounded-md px-3 py-2 bg-surface text-base text-foreground"
            >
              {academicYears.length === 0 && <option value={anneeScolaire}>{anneeScolaire}</option>}
              {academicYears.map((year) => (
                <option key={year} value={year} disabled={year === selected?.anneeScolaire}>
                  {year.replace('-', ' - ')}
                  {year === selected?.anneeScolaire ? ` (${t('currentYearSuffix')})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Nouvelle classe */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('newClassLabel')}
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="border border-border rounded-md px-3 py-2 bg-surface text-base text-foreground w-full"
            >
              <option value="">{t('selectPlaceholder')}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {sameYearBlocked && (
        <p
          role="alert"
          className="text-sm text-warning bg-warning/10 border border-warning rounded-md px-3 py-2"
        >
          {t('errorSameYear', { year: selected!.anneeScolaire })}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={submitting || sameYearBlocked}
          className="px-6 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-md disabled:opacity-50"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}

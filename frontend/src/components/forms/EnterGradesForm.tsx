'use client';

import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface ClassOption {
  id: string;
  name: string;
  /** Grading scale ("noté sur") of this class's cycle — see Cycles. */
  noteMax: number;
}

export interface SubjectOption {
  id: string;
  nom: string;
  coefficient: number;
}

interface StudentRow {
  id: string;
  nom: string;
  prenom: string;
}

interface GradeRow {
  studentId: string;
  subjectId: string;
  valeur: number;
}

const PERIODE_VALUES = ['T1', 'T2', 'T3'] as const;

const gridCols = { gridTemplateColumns: '2fr 1fr' };

export default function EnterGradesForm({
  classes,
  subjects,
  academicYears,
}: {
  classes: ClassOption[];
  subjects: SubjectOption[];
  /** Labels, e.g. ["2026-2027", "2025-2026", ...], most recent first. */
  academicYears: string[];
}) {
  const t = useTranslations('grades.enterForm');
  const tp = useTranslations('grades.periods');
  const router = useRouter();
  const { toast } = useToast();
  const PERIODES = PERIODE_VALUES.map((value) => ({ value, label: tp(value) }));
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [periode, setPeriode] = useState('T1');
  const [anneeScolaire, setAnneeScolaire] = useState(academicYears[0] ?? '2024-2025');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    setLoadingStudents(true);
    api<{ students: StudentRow[] }>(`/api/students?classId=${classId}`)
      .then((data) => {
        if (!cancelled) setStudents(data.students);
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStudents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  // Pre-fill existing grades for this class/subject/period so re-opening
  // enter-grades shows what's already saved instead of blank inputs.
  useEffect(() => {
    if (!classId || !subjectId) return;
    let cancelled = false;
    api<{ grades: GradeRow[] }>(
      `/api/grades?classId=${classId}&periode=${periode}&anneeScolaire=${anneeScolaire}`,
    )
      .then((data) => {
        if (cancelled) return;
        const forSubject = data.grades.filter((g) => g.subjectId === subjectId);
        const next: Record<string, string> = {};
        for (const g of forSubject) next[g.studentId] = String(g.valeur);
        setNotes(next);
      })
      .catch(() => {
        /* best-effort pre-fill only */
      });
    return () => {
      cancelled = true;
    };
  }, [classId, subjectId, periode, anneeScolaire]);

  const teacherOfSubject = subjects.find((s) => s.id === subjectId);
  const selectedClass = classes.find((c) => c.id === classId);
  const noteMax = selectedClass?.noteMax ?? 20;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!classId || !subjectId) {
      setError(t('errorSelectRequired'));
      return;
    }
    const entries = students
      .filter((s) => notes[s.id] !== undefined && notes[s.id] !== '')
      .map((s) => ({ studentId: s.id, valeur: Number(notes[s.id]) }));

    if (entries.length === 0) {
      setError(t('errorAtLeastOneGrade'));
      return;
    }
    if (entries.some((e) => Number.isNaN(e.valeur) || e.valeur < 0 || e.valeur > noteMax)) {
      setError(t('errorGradeRange', { max: noteMax }));
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/grades', {
        method: 'POST',
        body: { classId, subjectId, periode, anneeScolaire, entries },
      });
      setSuccess(true);
      toast(t('success'), 'success');
      const params = new URLSearchParams({ classId, periode, anneeScolaire });
      router.push(`/grades?${params.toString()}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {/* Filters */}
      <div className="px-4 py-4 md:px-8 border-b border-border bg-surface space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              {t('classLabel')}
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              {t('subjectLabel')}
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              {t('periodLabel')}
            </label>
            <select
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground"
            >
              {PERIODES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              {t('yearLabel')}
            </label>
            <select
              value={anneeScolaire}
              onChange={(e) => setAnneeScolaire(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground"
            >
              {academicYears.length === 0 && <option value={anneeScolaire}>{anneeScolaire}</option>}
              {academicYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-xs text-muted-foreground bg-secondary rounded-md px-3 py-2">
          {t('hint', {
            max: noteMax,
            coeff: teacherOfSubject ? t('hintCoeff', { value: teacherOfSubject.coefficient }) : '',
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: '360px' }}>
              {/* Table header */}
              <div className="grid px-5 py-3 bg-muted border-b border-border" style={gridCols}>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('headerStudent')}
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  {t('headerGrade', { max: noteMax })}
                </span>
              </div>

              {/* Rows */}
              <div>
                {loadingStudents ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                    {t('loadingStudents')}
                  </div>
                ) : students.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                    {t('noStudentsInClass')}
                  </div>
                ) : (
                  students.map((s) => (
                    <div
                      key={s.id}
                      className="grid px-5 py-3 border-b border-border items-center"
                      style={gridCols}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {s.nom} {s.prenom}
                        </span>
                      </div>
                      <div className="text-center">
                        <input
                          type="number"
                          min={0}
                          max={noteMax}
                          step={0.1}
                          placeholder="—"
                          value={notes[s.id] ?? ''}
                          onChange={(e) =>
                            setNotes((prev) => ({ ...prev, [s.id]: e.target.value }))
                          }
                          className="w-20 text-center border border-border rounded-md px-2 py-1.5 bg-background text-sm font-semibold text-foreground placeholder-muted-foreground"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger mt-4">
            {error}
          </p>
        )}
        {success && <p className="text-sm text-success mt-4">{t('success')}</p>}

        {/* Action buttons */}
        <div className="flex gap-3 justify-end mt-6">
          <Link
            href="/grades"
            className="px-6 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
          >
            {t('back')}
          </Link>
          <button
            type="submit"
            disabled={submitting || students.length === 0}
            className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </form>
  );
}

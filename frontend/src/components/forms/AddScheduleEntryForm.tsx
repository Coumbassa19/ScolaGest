'use client';

// "+ Ajouter un cours" panel on /schedule — the only way to actually create a
// ScheduleEntry from the UI (previously the page only ever displayed existing
// entries). Posts to the existing /api/schedule route (classId, subjectId,
// teacherId, jour, heureDebut, heureFin — unchanged shape, no redesign
// needed) then router.refresh()es the server component so the new session
// shows up immediately in the weekly grid.

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface ScheduleClassOption {
  id: string;
  name: string;
}

export interface ScheduleSubjectOption {
  id: string;
  nom: string;
  teacherId: string | null;
  teacherLabel: string | null;
}

const JOUR_VALUES = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'] as const;

export interface ScheduleEntryInitialData {
  classId: string;
  subjectId: string;
  jour: (typeof JOUR_VALUES)[number];
  heureDebut: string;
  heureFin: string;
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

// Maps the stable `error` codes /api/schedule{,/[id]} can return to the
// matching translation key in `schedule.form`, so a server error always
// reads in the app's current language instead of leaking the raw English
// string the route returns. VALIDATION_FAILED isn't mapped: the form
// already validates class/time client-side, so it falls back to
// err.message like any other unexpected code.
const ERROR_KEYS: Record<string, string> = {
  ENTRY_NOT_FOUND: 'errorEntryNotFound',
  FORBIDDEN: 'errorForbidden',
};

export default function AddScheduleEntryForm({
  classes,
  subjects,
  entryId,
  initialData,
}: {
  classes: ScheduleClassOption[];
  subjects: ScheduleSubjectOption[];
  /** When provided, the form edits this entry (PATCH) instead of creating one (POST). */
  entryId?: string;
  initialData?: ScheduleEntryInitialData;
}) {
  const router = useRouter();
  const t = useTranslations('schedule.form');
  const td = useTranslations('schedule.days');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const JOURS = JOUR_VALUES.map((value) => ({ value, label: td(value) }));
  const isEdit = Boolean(entryId);
  const [open, setOpen] = useState(isEdit);
  const [classId, setClassId] = useState(initialData?.classId ?? '');
  const [subjectId, setSubjectId] = useState(initialData?.subjectId ?? '');
  const [jour, setJour] = useState<(typeof JOUR_VALUES)[number]>(initialData?.jour ?? 'LUNDI');
  const [heureDebut, setHeureDebut] = useState(initialData?.heureDebut ?? '08:00');
  const [heureFin, setHeureFin] = useState(initialData?.heureFin ?? '09:00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.id === subjectId) ?? null,
    [subjects, subjectId],
  );

  function resetForm() {
    setClassId('');
    setSubjectId('');
    setJour('LUNDI');
    setHeureDebut('08:00');
    setHeureFin('09:00');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!classId) {
      setError(t('errorClassRequired'));
      return;
    }
    if (heureFin <= heureDebut) {
      setError(t('errorEndBeforeStart'));
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        classId,
        subjectId: subjectId || undefined,
        teacherId: selectedSubject?.teacherId || undefined,
        jour,
        heureDebut,
        heureFin,
      };
      if (isEdit) {
        await api(`/api/schedule/${entryId}`, { method: 'PATCH', body });
        toast(tCommon('updatedToast'), 'success');
        router.push('/schedule');
      } else {
        await api('/api/schedule', { method: 'POST', body });
        toast(tCommon('savedToast'), 'success');
        resetForm();
        setOpen(false);
      }
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md"
      >
        {t('addEntry')}
      </button>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-border px-4 py-5 md:px-6 md:py-6 w-full">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">
          {isEdit ? t('editTitle') : t('addTitle')}
        </h2>
        {!isEdit && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setOpen(false);
            }}
            className="text-xs font-semibold text-muted-foreground"
          >
            {t('close')}
          </button>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('classLabel')}
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
              className={fieldClass}
            >
              <option value="">{t('selectClassPlaceholder')}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('subjectLabel')}
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className={fieldClass}
            >
              <option value="">{t('noSubject')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Auto-filled teacher, read-only — matches the subject's assigned teacher */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('teacherLabel')}{' '}
            <span className="font-normal text-muted-foreground">{t('teacherAutoFilled')}</span>
          </label>
          <div className="border border-border rounded-md px-3 py-2 bg-input text-muted-foreground text-sm">
            {!subjectId
              ? t('teacherPromptNoSubject')
              : (selectedSubject?.teacherLabel ?? t('teacherNoneAssigned'))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('dayLabel')}
            </label>
            <select
              value={jour}
              onChange={(e) => setJour(e.target.value as (typeof JOUR_VALUES)[number])}
              className={fieldClass}
            >
              {JOURS.map((j) => (
                <option key={j.value} value={j.value}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('startTimeLabel')}
            </label>
            <input
              type="time"
              value={heureDebut}
              onChange={(e) => setHeureDebut(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('endTimeLabel')}
            </label>
            <input
              type="time"
              value={heureFin}
              onChange={(e) => setHeureFin(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={() => {
              if (isEdit) {
                router.push('/schedule');
              } else {
                resetForm();
                setOpen(false);
              }
            }}
            className="px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || classes.length === 0}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting ? t('saving') : isEdit ? t('saveChanges') : t('addToSchedule')}
          </button>
        </div>
      </form>
    </div>
  );
}

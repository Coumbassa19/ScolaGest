'use client';

// "Absences" section on the teacher detail page (src/app/teachers/[id]/page.tsx).
// Marks a specific calendar day as one this teacher didn't teach — teachers
// here are paid by the hour according to their emploi du temps
// (ScheduleEntry), so each marked day subtracts that weekday's scheduled
// hours from the auto-calculated monthly pay on Comptabilité > Paiement
// des enseignants (see that page for the deduction itself).

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface TeacherAbsenceRow {
  id: string;
  date: string; // "YYYY-MM-DD"
  reason: string | null;
}

const ERROR_KEYS: Record<string, string> = {
  TEACHER_NOT_FOUND: 'errorTeacherNotFound',
  ABSENCE_NOT_FOUND: 'errorAbsenceNotFound',
};

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TeacherAbsencePanel({
  teacherId,
  initialAbsences,
}: {
  teacherId: string;
  initialAbsences: TeacherAbsenceRow[];
}) {
  const t = useTranslations('teachers.detail.absences');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();

  const [absences, setAbsences] = useState(initialAbsences);
  const [date, setDate] = useState(todayValue());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function describeError(err: unknown): string {
    if (err instanceof ApiError) {
      const key = ERROR_KEYS[err.code];
      if (key) return t(key as never);
    }
    return tCommon('networkError');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date) {
      setError(t('errorDateRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ absence: TeacherAbsenceRow }>('/api/teacher-absences', {
        method: 'POST',
        body: { teacherId, date, reason: reason.trim() || undefined },
      });
      setAbsences((prev) =>
        [res.absence, ...prev.filter((a) => a.date !== res.absence.date)].sort((a, b) =>
          a.date < b.date ? 1 : -1,
        ),
      );
      setReason('');
      toast(t('savedToast'), 'success');
      router.refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onRemove(id: string) {
    if (!window.confirm(t('confirmRemove'))) return;
    setRemovingId(id);
    try {
      await api(`/api/teacher-absences/${id}`, { method: 'DELETE' });
      setAbsences((prev) => prev.filter((a) => a.id !== id));
      toast(t('removedToast'), 'success');
      router.refresh();
    } catch (err) {
      toast(describeError(err), 'error');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="bg-surface rounded-lg border border-border px-6 py-5">
      <div className="mb-4 pb-4 border-b border-border">
        <h2 className="text-lg font-headings font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col sm:flex-row gap-3 items-start sm:items-end"
      >
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('dateLabel')}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm"
          />
        </div>
        <div className="w-full flex-1">
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('reasonLabel')}
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('reasonPlaceholder')}
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md disabled:opacity-50 w-full sm:w-auto"
        >
          {submitting ? tCommon('saving') : t('markAbsent')}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger mt-2">
          {error}
        </p>
      )}

      {absences.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border space-y-2">
          {absences.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 text-sm border-b border-border/60 pb-2 last:border-0 last:pb-0"
            >
              <div>
                <span className="font-semibold text-foreground">{a.date}</span>
                {a.reason && <span className="text-muted-foreground"> — {a.reason}</span>}
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                disabled={removingId === a.id}
                className="text-xs font-semibold text-danger disabled:opacity-50"
              >
                {t('remove')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

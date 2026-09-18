'use client';

// Replaces the static "Année en cours" dropdown in Settings > Calendrier
// académique. Lets the user switch the active school year, and add a new
// one (e.g. moving from 2025-2026 to 2026-2027) — the previous static mock
// had no way to actually do either.
//
// Settings is a fully client-rendered page (it hangs off `useUser()`), so
// this component fetches its own data client-side rather than receiving it
// as a server-fetched prop.

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface AcademicYearOption {
  id: string;
  label: string;
  isCurrent: boolean;
}

export default function AcademicYearControl() {
  const t = useTranslations('settings.academicYear');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const [years, setYears] = useState<AcademicYearOption[] | null>(null);
  const current = years?.find((y) => y.isCurrent) ?? years?.[0];
  const [switching, setSwitching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ years: AcademicYearOption[] }>('/api/academic-years')
      .then((data) => {
        if (!cancelled) setYears(data.years);
      })
      .catch(() => {
        if (!cancelled) setYears([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshYears() {
    try {
      const data = await api<{ years: AcademicYearOption[] }>('/api/academic-years');
      setYears(data.years);
    } catch {
      // keep the previous list on a transient refresh failure
    }
  }

  async function onSwitch(id: string) {
    if (!id || id === current?.id) return;
    setError(null);
    setSwitching(true);
    try {
      await api(`/api/academic-years/${id}`, { method: 'PATCH', body: { isCurrent: true } });
      await refreshYears();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errorNetwork'));
    } finally {
      setSwitching(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}-\d{4}$/.test(newLabel.trim())) {
      setError(t('formatHint'));
      return;
    }
    setSwitching(true);
    try {
      await api('/api/academic-years', {
        method: 'POST',
        body: { label: newLabel.trim(), setCurrent: true },
      });
      setNewLabel('');
      setAdding(false);
      await refreshYears();
      toast(tCommon('savedToast'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-foreground mb-2">
        {t('currentLabel')}
      </label>
      {!adding ? (
        <div className="flex items-center gap-2">
          <select
            value={current?.id ?? ''}
            disabled={switching || !years || years.length === 0}
            onChange={(e) => onSwitch(e.target.value)}
            className="flex-1 border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground disabled:opacity-50"
          >
            {!years && <option value="">{t('loading')}</option>}
            {years?.length === 0 && <option value="">{t('none')}</option>}
            {years?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-semibold text-accent whitespace-nowrap"
          >
            {t('newYear')}
          </button>
        </div>
      ) : (
        <form onSubmit={onAdd} className="flex items-center gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('namePlaceholder')}
            autoFocus
            className="flex-1 border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={switching}
            className="px-3 py-2 text-xs font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {t('create')}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewLabel('');
              setError(null);
            }}
            className="text-xs font-semibold text-muted-foreground"
          >
            {t('cancel')}
          </button>
        </form>
      )}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}

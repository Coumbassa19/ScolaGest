'use client';

// Replaces the static "Année en cours" + "Calendrier académique" mock in
// Settings. Lets the user switch the active school year, add a new one, and
// configure the current year's trimestre (term) date ranges — the previous
// static mock had no way to actually do any of the three.
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
  term1Start: string | null;
  term1End: string | null;
  term2Start: string | null;
  term2End: string | null;
  term3Start: string | null;
  term3End: string | null;
}

interface TermRange {
  key: 'term1' | 'term2' | 'term3';
  start: string | null;
  end: string | null;
}

// Maps the stable `error` codes /api/academic-years{,/[id]} can return to
// the matching translation key in `settings.academicYear`, so a server
// error always reads in the app's current language instead of leaking the
// raw string the route returns. VALIDATION_FAILED isn't mapped: the "new
// year" label is validated client-side via the same AAAA-AAAA regex the
// server checks, so it falls back to err.message like any other unexpected
// code.
const ERROR_KEYS: Record<string, string> = {
  YEAR_ALREADY_EXISTS: 'errorYearAlreadyExists',
  YEAR_NOT_FOUND: 'errorYearNotFound',
};

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function formatRange(start: string | null, end: string | null, notConfigured: string): string {
  if (!start || !end) return notConfigured;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(start)} — ${fmt(end)}`;
}

export default function AcademicYearControl() {
  const t = useTranslations('settings.academicYear');
  const tCal = useTranslations('settings.calendar');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const [years, setYears] = useState<AcademicYearOption[] | null>(null);
  const current = years?.find((y) => y.isCurrent) ?? years?.[0];
  const [switching, setSwitching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [editingTerms, setEditingTerms] = useState(false);
  const [termForm, setTermForm] = useState<Record<string, string>>({});
  const [savingTerms, setSavingTerms] = useState(false);

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
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        setError(key ? t(key as never) : err.message);
      } else {
        setError(t('errorNetwork'));
      }
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
      let message = t('errorNetwork');
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        message = key ? t(key as never) : err.message;
      }
      toast(message, 'error');
    } finally {
      setSwitching(false);
    }
  }

  function openTermsEditor() {
    if (!current) return;
    setTermForm({
      term1Start: toDateInputValue(current.term1Start),
      term1End: toDateInputValue(current.term1End),
      term2Start: toDateInputValue(current.term2Start),
      term2End: toDateInputValue(current.term2End),
      term3Start: toDateInputValue(current.term3Start),
      term3End: toDateInputValue(current.term3End),
    });
    setEditingTerms(true);
  }

  async function onSaveTerms(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setSavingTerms(true);
    try {
      await api(`/api/academic-years/${current.id}`, {
        method: 'PATCH',
        body: {
          term1Start: termForm.term1Start || null,
          term1End: termForm.term1End || null,
          term2Start: termForm.term2Start || null,
          term2End: termForm.term2End || null,
          term3Start: termForm.term3Start || null,
          term3End: termForm.term3End || null,
        },
      });
      setEditingTerms(false);
      await refreshYears();
      toast(tCommon('savedToast'), 'success');
    } catch (err) {
      let message = t('errorNetwork');
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        message = key ? t(key as never) : err.message;
      }
      toast(message, 'error');
    } finally {
      setSavingTerms(false);
    }
  }

  const terms: TermRange[] = current
    ? [
        { key: 'term1', start: current.term1Start, end: current.term1End },
        { key: 'term2', start: current.term2Start, end: current.term2End },
        { key: 'term3', start: current.term3Start, end: current.term3End },
      ]
    : [];

  const today = new Date();
  const activeTerm = terms.find(
    (term) =>
      term.start && term.end && today >= new Date(term.start) && today <= new Date(term.end),
  );

  const dateFieldClass =
    'w-full border border-border rounded-md px-2 py-1.5 bg-background text-sm text-foreground';

  return (
    <div className="space-y-4">
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

      {current && (
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-sm font-semibold text-foreground">
              {tCal('currentPeriodLabel')}{' '}
              <span className="font-normal text-muted-foreground">
                {activeTerm ? tCal(activeTerm.key) : tCal('notConfigured')}
              </span>
            </span>
            {!editingTerms && (
              <button
                type="button"
                onClick={openTermsEditor}
                className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md whitespace-nowrap"
              >
                {tCal('configure')}
              </button>
            )}
          </div>

          {!editingTerms ? (
            <div className="space-y-2">
              {terms.map((term) => (
                <div
                  key={term.key}
                  className="flex items-center justify-between p-3 bg-muted rounded-md"
                >
                  <div>
                    <span className="text-sm font-semibold text-foreground">{tCal(term.key)}</span>
                    <p className="text-xs text-muted-foreground">
                      {formatRange(term.start, term.end, tCal('notConfigured'))}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openTermsEditor}
                    className="text-sm text-primary font-semibold"
                  >
                    {tCal('edit')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <form onSubmit={onSaveTerms} className="space-y-3">
              {(['term1', 'term2', 'term3'] as const).map((key) => (
                <div key={key} className="p-3 bg-muted rounded-md">
                  <span className="text-sm font-semibold text-foreground block mb-2">
                    {tCal(key)}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">
                        {tCal('startLabel')}
                      </label>
                      <input
                        type="date"
                        value={termForm[`${key}Start`] ?? ''}
                        onChange={(e) =>
                          setTermForm((f) => ({ ...f, [`${key}Start`]: e.target.value }))
                        }
                        className={dateFieldClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">
                        {tCal('endLabel')}
                      </label>
                      <input
                        type="date"
                        value={termForm[`${key}End`] ?? ''}
                        onChange={(e) =>
                          setTermForm((f) => ({ ...f, [`${key}End`]: e.target.value }))
                        }
                        className={dateFieldClass}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingTerms(false)}
                  className="px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
                >
                  {tCal('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingTerms}
                  className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
                >
                  {savingTerms ? tCal('saving') : tCal('save')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

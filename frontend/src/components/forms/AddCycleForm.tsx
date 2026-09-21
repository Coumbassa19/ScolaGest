'use client';

// "+ Ajouter un cycle" toggle panel on /cycles — the only way to create a
// Cycle. Posts to /api/cycles (name, noteMax, order). Also doubles as the
// edit form on /cycles/[id] (cycleId + initialData given → PATCH instead of
// POST, panel always open, no collapse button). Mirrors AddClassForm.tsx.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface CycleInitialData {
  name: string;
  noteMax: number;
  order: number;
}

// Maps the stable `error` codes /api/cycles{,/[id]} can return to the
// matching translation key in `cycles.form`, so a server error always reads
// in the app's current language instead of leaking the raw English string
// the route returns. VALIDATION_FAILED isn't mapped: the form already
// validates name/noteMax client-side, so it falls back to err.message like
// any other unexpected code.
const ERROR_KEYS: Record<string, string> = {
  CYCLE_ALREADY_EXISTS: 'errorCycleAlreadyExists',
  CYCLE_NOT_FOUND: 'errorCycleNotFound',
};

export default function AddCycleForm({
  cycleId,
  initialData,
}: {
  /** When provided, the form edits this cycle (PATCH) instead of creating one (POST). */
  cycleId?: string;
  initialData?: CycleInitialData;
}) {
  const router = useRouter();
  const t = useTranslations('cycles.form');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const isEdit = Boolean(cycleId);
  const [open, setOpen] = useState(isEdit);
  const [name, setName] = useState(initialData?.name ?? '');
  const [noteMax, setNoteMax] = useState(String(initialData?.noteMax ?? 20));
  const [order, setOrder] = useState(String(initialData?.order ?? 0));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setNoteMax('20');
    setOrder('0');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('errorNameRequired'));
      return;
    }
    const noteMaxNum = Number(noteMax);
    if (!Number.isInteger(noteMaxNum) || noteMaxNum < 1) {
      setError(t('errorNoteMaxInvalid'));
      return;
    }

    setSubmitting(true);
    try {
      const body = { name: name.trim(), noteMax: noteMaxNum, order: Number(order) || 0 };
      if (isEdit) {
        await api(`/api/cycles/${cycleId}`, { method: 'PATCH', body });
        toast(tCommon('updatedToast'), 'success');
        router.push('/cycles');
      } else {
        await api('/api/cycles', { method: 'POST', body });
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
        {t('addCycle')}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              required
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('noteMaxLabel')}
            </label>
            <input
              type="number"
              value={noteMax}
              onChange={(e) => setNoteMax(e.target.value)}
              min={1}
              max={100}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('noteMaxHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('orderLabel')}
            </label>
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              min={0}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('orderHint')}</p>
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
                router.push('/cycles');
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
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </button>
        </div>
      </form>
    </div>
  );
}

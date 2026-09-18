'use client';

// "+ Ajouter une classe" toggle panel on /classes — the only way to create a
// SchoolClass manually (until now they only ever came from the dev seed
// script). Posts to the existing /api/classes route (name, level). Also
// doubles as the edit form on /classes/[id] (classId + initialData given →
// PATCH instead of POST, panel always open, no collapse button).

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface ClassInitialData {
  name: string;
  level: number;
}

export default function AddClassForm({
  classId,
  initialData,
}: {
  /** When provided, the form edits this class (PATCH) instead of creating one (POST). */
  classId?: string;
  initialData?: ClassInitialData;
}) {
  const router = useRouter();
  const t = useTranslations('classes.form');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const isEdit = Boolean(classId);
  const [open, setOpen] = useState(isEdit);
  const [name, setName] = useState(initialData?.name ?? '');
  const [level, setLevel] = useState(String(initialData?.level ?? 0));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setLevel('0');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('errorNameRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const body = { name: name.trim(), level: Number(level) || 0 };
      if (isEdit) {
        await api(`/api/classes/${classId}`, { method: 'PATCH', body });
        toast(tCommon('updatedToast'), 'success');
        router.push('/classes');
      } else {
        await api('/api/classes', { method: 'POST', body });
        toast(tCommon('savedToast'), 'success');
        resetForm();
        setOpen(false);
      }
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
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
        {t('addClass')}
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
              {t('levelLabel')}
            </label>
            <input
              type="number"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              min={0}
              max={20}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('levelHint')}</p>
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
                router.push('/classes');
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

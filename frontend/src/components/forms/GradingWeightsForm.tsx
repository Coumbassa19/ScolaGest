'use client';

// "Pondération des notes" section on /settings — how a subject's trimester
// grade blends its devoirs (arithmetic mean) with its composition (see
// src/lib/server/grades/moyenne.ts). Separate from SchoolSettingsForm (like
// AcademicYearControl is its own sibling section) since this is a grading
// rule, not identity/branding config. PATCHes the same /api/school-settings
// route — SchoolSettings is one row per school either way.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface GradingWeightsData {
  coefDevoir: number;
  coefComposition: number;
}

const fieldClass = 'w-full border border-border rounded-md px-3 py-2 bg-background text-sm';

export default function GradingWeightsForm({ initialData }: { initialData: GradingWeightsData }) {
  const router = useRouter();
  const t = useTranslations('settings.grading');
  const { toast } = useToast();

  const [coefDevoir, setCoefDevoir] = useState(String(initialData.coefDevoir));
  const [coefComposition, setCoefComposition] = useState(String(initialData.coefComposition));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const devoirNum = Number(coefDevoir);
    const compositionNum = Number(coefComposition);
    if (!Number.isInteger(devoirNum) || devoirNum < 1 || devoirNum > 20) {
      setError(t('errorInvalid'));
      return;
    }
    if (!Number.isInteger(compositionNum) || compositionNum < 1 || compositionNum > 20) {
      setError(t('errorInvalid'));
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/school-settings', {
        method: 'PATCH',
        body: { coefDevoir: devoirNum, coefComposition: compositionNum },
      });
      toast(t('saved'), 'success');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-lg border border-border px-6 py-5">
      <div className="mb-5 pb-5 border-b border-border">
        <h2 className="text-lg font-headings font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('coefDevoirLabel')}
            </label>
            <input
              type="number"
              value={coefDevoir}
              onChange={(e) => setCoefDevoir(e.target.value)}
              min={1}
              max={20}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('coefCompositionLabel')}
            </label>
            <input
              type="number"
              value={coefComposition}
              onChange={(e) => setCoefComposition(e.target.value)}
              min={1}
              max={20}
              className={fieldClass}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </form>
  );
}

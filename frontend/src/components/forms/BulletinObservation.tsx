'use client';

// "Observations du Conseil" box on /bulletin — used to be an auto-generated,
// read-only sentence derived from the average. Now a real textarea, saved to
// BulletinRemark (one row per student+periode) via /api/bulletin-remarks.
// Saves automatically when the field loses focus — no visible save button.

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';

// Maps the stable `error` codes /api/bulletin-remarks can return to the
// matching translation key in `bulletin`, so a server error always reads
// in the app's current language instead of leaking the raw string the
// route returns. VALIDATION_FAILED isn't mapped: studentId/periode come
// from props, not user input, so it isn't a case a user can realistically
// hit and falls back to err.message like any other unexpected code.
const ERROR_KEYS: Record<string, string> = {
  STUDENT_NOT_FOUND: 'observationErrorStudentNotFound',
};

export default function BulletinObservation({
  studentId,
  periode,
  initialValue,
}: {
  studentId: string;
  periode: string;
  initialValue: string;
}) {
  const t = useTranslations('bulletin');
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedRef = useRef(initialValue);

  async function onBlur() {
    const trimmed = value.trim();
    if (trimmed === lastSavedRef.current) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api('/api/bulletin-remarks', {
        method: 'PUT',
        body: { studentId, periode, observation: trimmed },
      });
      lastSavedRef.current = trimmed;
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        setError(key ? t(key as never) : err.message);
      } else {
        setError(t('observationErrorNetwork'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={onBlur}
        rows={3}
        placeholder={t('observationPlaceholder')}
        className="w-full border border-border rounded-md px-3 py-3 min-h-16 text-sm text-foreground placeholder-muted-foreground"
      />
      <div className="flex items-center gap-3 mt-2 print:hidden">
        {saving && <span className="text-xs text-muted-foreground">{t('observationSaving')}</span>}
        {!saving && saved && <span className="text-xs text-success">{t('observationSaved')}</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}

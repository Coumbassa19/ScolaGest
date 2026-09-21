'use client';

// Inline-editable "Salaire par heure" cell on Comptabilité > Paiement des
// enseignants. Teachers here are paid by the hour according to their emploi
// du temps, so this is a taux horaire (GNF/heure), not a flat monthly
// amount — it feeds the auto-calculated montant on the payment form
// (heures/semaine × 4 × taux). Saves to Teacher.tauxHoraire via the
// existing PATCH /api/teachers/[id] route.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

// Maps the stable `error` codes PATCH /api/teachers/[id] can return to the
// matching translation key in `accounting.teacherPayments.salaryCell`, so a
// server error always reads in the app's current language instead of
// leaking the raw string the route returns.
const ERROR_KEYS: Record<string, string> = {
  TEACHER_NOT_FOUND: 'errorTeacherNotFound',
};

export default function EditableSalaryCell({
  teacherId,
  tauxHoraire,
}: {
  teacherId: string;
  tauxHoraire: number | null;
}) {
  const t = useTranslations('accounting.teacherPayments.salaryCell');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tauxHoraire !== null ? String(tauxHoraire) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    const newTauxHoraire = Number(value);
    if (!Number.isFinite(newTauxHoraire) || newTauxHoraire < 0) {
      setError(t('invalidAmount'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api(`/api/teachers/${teacherId}`, {
        method: 'PATCH',
        body: { tauxHoraire: newTauxHoraire },
      });
      setEditing(false);
      toast(tCommon('savedToast'), 'success');
      router.refresh();
    } catch (err) {
      let message = tCommon('networkError');
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        message = key ? t(key as never) : err.message;
      }
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(tauxHoraire !== null ? String(tauxHoraire) : '');
          setEditing(true);
        }}
        className="text-sm text-foreground hover:underline text-left"
      >
        {tauxHoraire !== null ? `${tauxHoraire.toLocaleString('fr-FR')} GNF/h` : t('placeholder')}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void onSave();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-28 border border-border rounded-md px-2 py-1 bg-background text-foreground text-sm"
      />
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={saving}
        className="text-xs font-semibold text-primary disabled:opacity-50"
      >
        {saving ? '…' : 'OK'}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs font-semibold text-muted-foreground"
      >
        ✕
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

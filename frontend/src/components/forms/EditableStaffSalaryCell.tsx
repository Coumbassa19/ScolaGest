'use client';

// Inline-editable "Salaire mensuel" cell on Comptabilité > Paiement des
// personnels. Unlike EditableSalaryCell (teachers' taux horaire, GNF/heure),
// this is a flat fixed monthly amount — it feeds the auto-filled montant on
// the payment form directly, with no hours calculation. Saves to
// Staff.salaireMensuel via PATCH /api/staff/[id].

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function EditableStaffSalaryCell({
  staffId,
  salaireMensuel,
}: {
  staffId: string;
  salaireMensuel: number;
}) {
  const t = useTranslations('accounting.staffPayments.salaryCell');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(salaireMensuel));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    const newSalaire = Number(value);
    if (!Number.isFinite(newSalaire) || newSalaire < 0) {
      setError(t('invalidAmount'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api(`/api/staff/${staffId}`, {
        method: 'PATCH',
        body: { salaireMensuel: newSalaire },
      });
      setEditing(false);
      toast(tCommon('savedToast'), 'success');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('networkError'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(salaireMensuel));
          setEditing(true);
        }}
        className="text-sm text-foreground hover:underline text-left"
      >
        {salaireMensuel.toLocaleString('fr-FR')} GNF
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

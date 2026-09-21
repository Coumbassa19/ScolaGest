'use client';

// "Barème de scolarité" panel on Comptabilité > Frais de scolarité — sets
// the annual tuition amount due per class (real schools price tuition by
// grade level, not one flat school-wide fee). One row per class, each with
// its own editable amount + save button; POSTs to
// /api/accounting/tuition-plans (upsert by classId+anneeScolaire).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface TuitionPlanRow {
  classId: string;
  className: string;
  montantAnnuel: number | null;
}

// Maps the stable `error` codes POST /api/accounting/tuition-plans can
// return to the matching translation key in `accounting.tuition.plan`, so a
// server error always reads in the app's current language instead of
// leaking the raw string the route returns.
const ERROR_KEYS: Record<string, string> = {
  CLASS_NOT_FOUND: 'errorClassNotFound',
};

function ClassRow({ row, anneeScolaire }: { row: TuitionPlanRow; anneeScolaire: string }) {
  const t = useTranslations('accounting.tuition.plan');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  // Rows with a montant already set start read-only with a "Modifier"
  // button, matching the edit pattern used everywhere else in the app —
  // rows still missing a montant open straight into edit mode since they
  // need one entered.
  const [editing, setEditing] = useState(row.montantAnnuel === null);
  const [value, setValue] = useState(row.montantAnnuel !== null ? String(row.montantAnnuel) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    const montantAnnuel = Number(value);
    if (!Number.isFinite(montantAnnuel) || montantAnnuel < 0) {
      setError(t('invalidAmount'));
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api('/api/accounting/tuition-plans', {
        method: 'POST',
        body: { classId: row.classId, anneeScolaire, montantAnnuel },
      });
      setSaved(true);
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
      <div className="grid grid-cols-3 gap-3 px-4 py-2.5 border-b border-border items-center last:border-b-0">
        <span className="text-sm font-semibold text-foreground">{row.className}</span>
        <span className="text-sm text-foreground">
          {row.montantAnnuel !== null ? `${row.montantAnnuel.toLocaleString('fr-FR')} GNF` : '—'}
        </span>
        <div className="flex items-center gap-2 justify-end">
          {saved && <span className="text-xs text-success">{t('saved')}</span>}
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
            className="text-accent text-xs font-semibold"
          >
            {tCommon('edit')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 px-4 py-2.5 border-b border-border items-center last:border-b-0">
      <span className="text-sm font-semibold text-foreground">{row.className}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder={t('notSetPlaceholder')}
        className="w-full border border-border rounded-md px-2 py-1.5 bg-background text-foreground text-sm"
      />
      <div className="flex items-center gap-2 justify-end">
        {error && <span className="text-xs text-danger">{error}</span>}
        {row.montantAnnuel !== null && (
          <button
            type="button"
            onClick={() => {
              setValue(String(row.montantAnnuel));
              setError(null);
              setEditing(false);
            }}
            className="px-2 py-1 text-xs font-semibold text-foreground border border-border rounded-md bg-surface"
          >
            {tCommon('cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="px-3 py-1 text-xs font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
        >
          {saving ? '…' : tCommon('save')}
        </button>
      </div>
    </div>
  );
}

export default function TuitionPlanPanel({
  rows,
  anneeScolaire,
}: {
  rows: TuitionPlanRow[];
  anneeScolaire: string;
}) {
  const t = useTranslations('accounting.tuition.plan');
  const tCommon = useTranslations('common');
  // Collapsed by default (school request: keep the "Frais de scolarité"
  // page focused on balances at a glance) — the "classes non définies"
  // badge stays visible in the header either way, so a missing fee
  // schedule is still noticed without the panel being open.
  const [open, setOpen] = useState(false);
  const nbNonDefini = rows.filter((r) => r.montantAnnuel === null).length;

  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-muted"
      >
        <h2 className="text-sm font-semibold text-foreground">
          {t('title', { year: anneeScolaire })}
          {nbNonDefini > 0 && (
            <span className="ml-2 text-xs font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">
              {t('classesUndefined', { count: nbNonDefini })}
            </span>
          )}
        </h2>
        <span className="text-xs font-semibold text-primary">
          {open ? t('hide') : tCommon('edit')}
        </span>
      </button>
      {open && (
        <div>
          <div className="grid grid-cols-3 gap-3 px-4 py-2 border-b border-border bg-background">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              {t('classHeader')}
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              {t('amountHeader')}
            </span>
            <span></span>
          </div>
          {rows.map((row) => (
            <ClassRow key={row.classId} row={row} anneeScolaire={anneeScolaire} />
          ))}
        </div>
      )}
    </div>
  );
}

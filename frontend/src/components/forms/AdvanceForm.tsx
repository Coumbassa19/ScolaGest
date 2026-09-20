'use client';

// "+ Accorder une avance" panel on Comptabilité > Avances sur salaire.
// Posts to /api/accounting/salary-advances. An advance targets either a
// teacher or a staff member (never both) and names the pay period it
// should reduce — Paiement des enseignants / Paiement des personnels read
// outstanding advances for that same person+month to show a "montant net
// à payer" hint.

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface AdvanceTeacherOption {
  id: string;
  nom: string;
  prenom: string;
}

export interface AdvanceStaffOption {
  id: string;
  nom: string;
  prenom: string;
  poste: string;
}

export interface AdvanceInitialData {
  personType: 'TEACHER' | 'STAFF';
  personId: string;
  montant: string;
  date: string; // yyyy-mm-dd
  motif: string;
  periodeAAffecter: string;
  moyenPaiement: 'ESPECES' | 'ORANGE_MONEY' | 'VIREMENT';
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

const MOYEN_VALUES = ['ESPECES', 'ORANGE_MONEY', 'VIREMENT'] as const;

const FORM_ERROR_KEYS: Record<string, string> = {
  TEACHER_NOT_FOUND: 'errorTeacherNotFound',
  STAFF_NOT_FOUND: 'errorStaffNotFound',
};
const COMMON_ERROR_KEYS: Record<string, string> = {
  ADVANCE_NOT_FOUND: 'errorAdvanceNotFound',
};

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdvanceForm({
  teachers,
  staff,
  advanceId,
  initialData,
}: {
  teachers: AdvanceTeacherOption[];
  staff: AdvanceStaffOption[];
  /** When provided, the form edits this advance (PATCH) instead of creating one (POST). */
  advanceId?: string;
  initialData?: AdvanceInitialData;
}) {
  const t = useTranslations('accounting.salaryAdvances.form');
  const tc = useTranslations('accounting.common');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(advanceId);
  const [open, setOpen] = useState(isEdit);
  const [personType, setPersonType] = useState<'TEACHER' | 'STAFF'>(
    initialData?.personType ?? 'TEACHER',
  );
  const [personId, setPersonId] = useState(initialData?.personId ?? '');
  const [montant, setMontant] = useState(initialData?.montant ?? '');
  const [date, setDate] = useState(initialData?.date ?? todayValue());
  const [motif, setMotif] = useState(initialData?.motif ?? '');
  const [periodeAAffecter, setPeriodeAAffecter] = useState(
    initialData?.periodeAAffecter ?? currentMonthValue(),
  );
  const [moyenPaiement, setMoyenPaiement] = useState<(typeof MOYEN_VALUES)[number]>(
    initialData?.moyenPaiement ?? 'ESPECES',
  );
  const MOYENS = MOYEN_VALUES.map((value) => ({ value, label: tc(`methods.${value}`) }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personOptions = useMemo(
    () =>
      personType === 'TEACHER'
        ? teachers.map((tch) => ({ id: tch.id, label: `${tch.nom} ${tch.prenom}` }))
        : staff.map((s) => ({ id: s.id, label: `${s.nom} ${s.prenom} — ${s.poste}` })),
    [personType, teachers, staff],
  );

  function resetForm() {
    setPersonType('TEACHER');
    setPersonId('');
    setMontant('');
    setDate(todayValue());
    setMotif('');
    setPeriodeAAffecter(currentMonthValue());
    setMoyenPaiement('ESPECES');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!personId) {
      setError(t('selectPersonError'));
      return;
    }
    const amount = Number(montant);
    if (!amount || amount <= 0) {
      setError(tc('invalidAmountError'));
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(periodeAAffecter)) {
      setError(t('invalidMonthError'));
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        ...(personType === 'TEACHER' ? { teacherId: personId } : { staffId: personId }),
        montant: amount,
        date: new Date(date).toISOString(),
        ...(motif.trim() ? { motif: motif.trim() } : {}),
        periodeAAffecter,
        moyenPaiement,
      };
      if (isEdit) {
        await api(`/api/accounting/salary-advances/${advanceId}`, { method: 'PATCH', body });
        toast(tc('paymentUpdatedToast'), 'success');
        router.push('/accounting/salary-advances');
      } else {
        await api('/api/accounting/salary-advances', { method: 'POST', body });
        toast(t('savedToast'), 'success');
        resetForm();
        setOpen(false);
      }
      router.refresh();
    } catch (err) {
      let message = tCommon('networkError');
      if (err instanceof ApiError) {
        const formKey = FORM_ERROR_KEYS[err.code];
        const commonKey = COMMON_ERROR_KEYS[err.code];
        message = formKey ? t(formKey as never) : commonKey ? t(commonKey as never) : err.message;
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
        {t('addButton')}
      </button>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-border px-4 py-5 md:px-6 md:py-6 w-full">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">
          {isEdit ? tc('editPaymentTitle') : t('createTitle')}
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
            {tCommon('close')}
          </button>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {!isEdit && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('personTypeLabel')}
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  checked={personType === 'TEACHER'}
                  onChange={() => {
                    setPersonType('TEACHER');
                    setPersonId('');
                  }}
                />
                {t('personTypeTeacher')}
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  checked={personType === 'STAFF'}
                  onChange={() => {
                    setPersonType('STAFF');
                    setPersonId('');
                  }}
                />
                {t('personTypeStaff')}
              </label>
            </div>
          </div>
        )}

        {!isEdit && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('personLabel')}
            </label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              required
              className={fieldClass}
            >
              <option value="">{t('selectPersonPlaceholder')}</option>
              {personOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('dateLabel')}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {tc('amountLabel')}
            </label>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder={t('amountPlaceholder')}
              required
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('periodeLabel')}
            </label>
            <input
              type="month"
              value={periodeAAffecter}
              onChange={(e) => setPeriodeAAffecter(e.target.value)}
              required
              className={fieldClass}
            />
            <p className="text-xs text-muted-foreground mt-1.5">{t('periodeHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {tc('paymentMethodLabel')}
            </label>
            <select
              value={moyenPaiement}
              onChange={(e) => setMoyenPaiement(e.target.value as (typeof MOYEN_VALUES)[number])}
              className={fieldClass}
            >
              {MOYENS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('motifLabel')}
          </label>
          <input
            type="text"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder={t('motifPlaceholder')}
            className={fieldClass}
          />
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
                router.push('/accounting/salary-advances');
              } else {
                resetForm();
                setOpen(false);
              }
            }}
            className="px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting ? tCommon('saving') : isEdit ? tc('saveChanges') : tc('savePayment')}
          </button>
        </div>
      </form>
    </div>
  );
}

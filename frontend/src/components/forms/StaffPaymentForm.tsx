'use client';

// "+ Enregistrer un paiement" panel on Comptabilité > Paiement des
// personnels. Posts to /api/accounting/staff-payments. Staff here are paid a
// flat, fixed monthly salary (unlike teachers, who are paid by the hour), so
// selecting one auto-fills the montant with their salaireMensuel directly —
// no hours/rate calculation. The field stays editable for prorated months,
// bonuses, or any manual correction. The backend rejects a second payment
// for the same person+month outright (see the @@unique constraint on
// StaffPayment).

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface PayableStaff {
  id: string;
  nom: string;
  prenom: string;
  poste: string;
  salaireMensuel: number;
  /** Outstanding (EN_COURS) salary advance flagged against THIS month — see Avances sur salaire. */
  outstandingAdvance: number;
}

export interface StaffPaymentInitialData {
  staffId: string;
  periode: string;
  montant: string;
  moyenPaiement: 'ESPECES' | 'ORANGE_MONEY' | 'VIREMENT';
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

const MOYEN_VALUES = ['ESPECES', 'ORANGE_MONEY', 'VIREMENT'] as const;

// Maps the stable `error` codes the backend returns (see
// /api/accounting/staff-payments{,/[id]}) to the matching translation key in
// `accounting.staffPayments.form` / `accounting.common` — same pattern as
// TeacherPaymentForm.
const FORM_ERROR_KEYS: Record<string, string> = {
  ALREADY_PAID: 'errorAlreadyPaid',
  STAFF_NOT_FOUND: 'errorStaffNotFound',
};
const COMMON_ERROR_KEYS: Record<string, string> = {
  PAYMENT_NOT_FOUND: 'errorPaymentNotFound',
};

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function StaffPaymentForm({
  staff,
  paymentId,
  initialData,
}: {
  staff: PayableStaff[];
  /** When provided, the form edits this payment (PATCH) instead of creating one (POST). */
  paymentId?: string;
  initialData?: StaffPaymentInitialData;
}) {
  const t = useTranslations('accounting.staffPayments.form');
  const tc = useTranslations('accounting.common');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(paymentId);
  const [open, setOpen] = useState(isEdit);
  const [staffId, setStaffId] = useState(initialData?.staffId ?? '');
  const [periode, setPeriode] = useState(initialData?.periode ?? currentMonthValue());
  const [montant, setMontant] = useState(initialData?.montant ?? '');
  const [montantAuto, setMontantAuto] = useState(!isEdit);
  const [moyenPaiement, setMoyenPaiement] = useState<(typeof MOYEN_VALUES)[number]>(
    initialData?.moyenPaiement ?? 'ESPECES',
  );
  const MOYENS = MOYEN_VALUES.map((value) => ({ value, label: tc(`methods.${value}`) }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStaff = useMemo(
    () => staff.find((s) => s.id === staffId) ?? null,
    [staff, staffId],
  );

  function onStaffChange(id: string) {
    setStaffId(id);
    if (montantAuto) {
      const s = staff.find((st) => st.id === id) ?? null;
      setMontant(s ? String(Math.max(0, s.salaireMensuel - s.outstandingAdvance)) : '');
    }
  }

  function resetForm() {
    setStaffId('');
    setPeriode(currentMonthValue());
    setMontant('');
    setMontantAuto(true);
    setMoyenPaiement('ESPECES');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!staffId) {
      setError(t('selectStaffError'));
      return;
    }
    const amount = Number(montant);
    if (!amount || amount <= 0) {
      setError(tc('invalidAmountError'));
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      setError(t('invalidMonthError'));
      return;
    }

    setSubmitting(true);
    try {
      const body = { staffId, periode, montant: amount, moyenPaiement };
      if (isEdit) {
        await api(`/api/accounting/staff-payments/${paymentId}`, { method: 'PATCH', body });
        toast(tc('paymentUpdatedToast'), 'success');
        router.push('/accounting/staff-payments');
      } else {
        await api('/api/accounting/staff-payments', { method: 'POST', body });
        toast(tc('paymentSavedToast'), 'success');
        resetForm();
        setOpen(false);
      }
      router.refresh();
    } catch (err) {
      let message = tCommon('networkError');
      if (err instanceof ApiError) {
        const formKey = FORM_ERROR_KEYS[err.code];
        const commonKey = COMMON_ERROR_KEYS[err.code];
        message = formKey ? t(formKey as never) : commonKey ? tc(commonKey as never) : err.message;
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
        {tc('addPayment')}
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
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('staffLabel')}
          </label>
          <select
            value={staffId}
            onChange={(e) => onStaffChange(e.target.value)}
            required
            className={fieldClass}
          >
            <option value="">{t('selectStaffPlaceholder')}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom} {s.prenom} — {s.poste} ({s.salaireMensuel.toLocaleString('fr-FR')} GNF)
              </option>
            ))}
          </select>
          {selectedStaff && montantAuto && (
            <p className="text-xs text-success mt-1">{t('autoFilled')}</p>
          )}
          {selectedStaff && selectedStaff.outstandingAdvance > 0 && (
            <p className="text-xs text-warning mt-1">
              {t('outstandingAdvanceHint', {
                amount: selectedStaff.outstandingAdvance.toLocaleString('fr-FR'),
              })}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('monthLabel')}
            </label>
            <input
              type="month"
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
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
              onChange={(e) => {
                setMontant(e.target.value);
                setMontantAuto(false);
              }}
              placeholder={t('amountPlaceholder')}
              required
              className={fieldClass}
            />
          </div>
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
                router.push('/accounting/staff-payments');
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
            disabled={submitting || staff.length === 0}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting ? tCommon('saving') : isEdit ? tc('saveChanges') : tc('savePayment')}
          </button>
        </div>
      </form>
    </div>
  );
}

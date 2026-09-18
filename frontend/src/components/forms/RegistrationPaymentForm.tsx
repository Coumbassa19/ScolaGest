'use client';

// "+ Enregistrer un paiement" panel on Comptabilité > Inscription &
// Réinscription. Posts to /api/accounting/registration, which both records
// the payment (RevenuePayment, categorie INSCRIPTION/REINSCRIPTION) and
// writes the chosen statut back onto the student — the two are the same
// fact told once, not two things to keep in sync by hand.

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

// Maps the stable `error` codes returned by /api/accounting/registration{,/[id]}
// to the matching `accounting.common` translation key, so a server error
// always reads in the app's current language — same pattern as login/page.tsx.
const COMMON_ERROR_KEYS: Record<string, string> = {
  STUDENT_NOT_FOUND: 'errorStudentNotFound',
  PAYMENT_NOT_FOUND: 'errorPaymentNotFound',
};

export interface RegistrationStudentOption {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  className: string;
  statut: string;
}

export interface RegistrationPaymentInitialData {
  studentId: string;
  statut: 'NOUVEAU' | 'ANCIEN';
  montant: string;
  moyenPaiement: 'ESPECES' | 'WAVE' | 'ORANGE_MONEY' | 'VIREMENT';
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

const MOYEN_VALUES = ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'VIREMENT'] as const;

export default function RegistrationPaymentForm({
  students,
  paymentId,
  initialData,
}: {
  students: RegistrationStudentOption[];
  /** When provided, the form edits this payment (PATCH) instead of creating one (POST). */
  paymentId?: string;
  initialData?: RegistrationPaymentInitialData;
}) {
  const t = useTranslations('accounting.registration.form');
  const tc = useTranslations('accounting.common');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(paymentId);
  const [open, setOpen] = useState(isEdit);
  const [studentId, setStudentId] = useState(initialData?.studentId ?? '');
  const [statut, setStatut] = useState<'NOUVEAU' | 'ANCIEN'>(initialData?.statut ?? 'NOUVEAU');
  const [montant, setMontant] = useState(initialData?.montant ?? '');
  const [moyenPaiement, setMoyenPaiement] = useState<(typeof MOYEN_VALUES)[number]>(
    initialData?.moyenPaiement ?? 'ESPECES',
  );
  const MOYENS = MOYEN_VALUES.map((value) => ({ value, label: tc(`methods.${value}`) }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === studentId) ?? null,
    [students, studentId],
  );

  function onStudentChange(id: string) {
    setStudentId(id);
    const s = students.find((st) => st.id === id);
    if (s) setStatut(s.statut === 'ANCIEN' ? 'ANCIEN' : 'NOUVEAU');
  }

  function resetForm() {
    setStudentId('');
    setStatut('NOUVEAU');
    setMontant('');
    setMoyenPaiement('ESPECES');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!studentId) {
      setError(t('selectStudentError'));
      return;
    }
    const amount = Number(montant);
    if (!amount || amount <= 0) {
      setError(tc('invalidAmountError'));
      return;
    }

    setSubmitting(true);
    try {
      const body = { studentId, statut, montant: amount, moyenPaiement };
      if (isEdit) {
        await api(`/api/accounting/registration/${paymentId}`, { method: 'PATCH', body });
        toast(tc('paymentUpdatedToast'), 'success');
        router.push('/accounting/registration');
      } else {
        await api('/api/accounting/registration', { method: 'POST', body });
        toast(tc('paymentSavedToast'), 'success');
        resetForm();
        setOpen(false);
      }
      router.refresh();
    } catch (err) {
      let message = tCommon('networkError');
      if (err instanceof ApiError) {
        const commonKey = COMMON_ERROR_KEYS[err.code];
        message = commonKey ? tc(commonKey as never) : err.message;
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
            {tc('studentLabel')}
          </label>
          <select
            value={studentId}
            onChange={(e) => onStudentChange(e.target.value)}
            required
            className={fieldClass}
          >
            <option value="">{tc('selectStudentPlaceholder')}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom} {s.prenom} — {s.className} ({s.matricule})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('statusLabel')} <span className="font-normal text-muted-foreground">{t('statusHint')}</span>
            </label>
            <select
              value={statut}
              onChange={(e) => setStatut(e.target.value as 'NOUVEAU' | 'ANCIEN')}
              className={fieldClass}
            >
              <option value="NOUVEAU">{t('statusNew')}</option>
              <option value="ANCIEN">{t('statusFormer')}</option>
            </select>
            {selectedStudent && selectedStudent.statut !== statut && (
              <p className="text-xs text-warning mt-1">{t('statusChangeWarning')}</p>
            )}
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
                router.push('/accounting/registration');
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
            disabled={submitting || students.length === 0}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting
              ? tCommon('saving')
              : isEdit
                ? tc('saveChanges')
                : tc('savePayment')}
          </button>
        </div>
      </form>
    </div>
  );
}

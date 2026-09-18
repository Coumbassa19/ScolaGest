'use client';

// "+ Enregistrer un paiement" panel on Comptabilité > Frais de scolarité.
// Posts to /api/accounting/tuition (categorie SCOLARITE on RevenuePayment).
// `periode` distinguishes trimestrial installments from a single annual
// lump-sum payment, per the school's actual billing frequency.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

// Maps the stable `error` codes returned by /api/accounting/tuition{,/[id]}
// to the matching `accounting.common` translation key, so a server error
// always reads in the app's current language — same pattern as login/page.tsx.
const COMMON_ERROR_KEYS: Record<string, string> = {
  STUDENT_NOT_FOUND: 'errorStudentNotFound',
  PAYMENT_NOT_FOUND: 'errorPaymentNotFound',
};

export interface TuitionStudentOption {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  className: string;
  /** Annual fee-schedule amount (GNF) for this student's class; null if undefined. */
  due: number | null;
  /** Total already paid toward tuition this school year (GNF), before this new payment. */
  paid: number;
}

function fmtAmount(n: number, locale: string): string {
  return n.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR');
}

export interface TuitionPaymentInitialData {
  studentId: string;
  periode: 'T1' | 'T2' | 'T3' | 'ANNUEL';
  montant: string;
  moyenPaiement: 'ESPECES' | 'WAVE' | 'ORANGE_MONEY' | 'VIREMENT';
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

const PERIODE_VALUES = ['T1', 'T2', 'T3', 'ANNUEL'] as const;
const MOYEN_VALUES = ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'VIREMENT'] as const;

export default function TuitionPaymentForm({
  students,
  paymentId,
  initialData,
}: {
  students: TuitionStudentOption[];
  /** When provided, the form edits this payment (PATCH) instead of creating one (POST). */
  paymentId?: string;
  initialData?: TuitionPaymentInitialData;
}) {
  const t = useTranslations('accounting.tuition.form');
  const tc = useTranslations('accounting.common');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(paymentId);
  const [open, setOpen] = useState(isEdit);
  const [studentId, setStudentId] = useState(initialData?.studentId ?? '');
  const [periode, setPeriode] = useState<(typeof PERIODE_VALUES)[number]>(
    initialData?.periode ?? 'T1',
  );
  const [montant, setMontant] = useState(initialData?.montant ?? '');
  const [moyenPaiement, setMoyenPaiement] = useState<(typeof MOYEN_VALUES)[number]>(
    initialData?.moyenPaiement ?? 'ESPECES',
  );
  const PERIODES = PERIODE_VALUES.map((value) => ({ value, label: t(`periods.${value}`) }));
  const MOYENS = MOYEN_VALUES.map((value) => ({ value, label: tc(`methods.${value}`) }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Amount-field guidance — not shown while editing an existing payment,
  // since "total due" / "remaining" read confusingly once the very payment
  // being corrected is folded into the student's already-paid total.
  const selectedStudent = !isEdit ? students.find((s) => s.id === studentId) : undefined;
  const remaining =
    selectedStudent && selectedStudent.due !== null
      ? Math.max(0, selectedStudent.due - selectedStudent.paid)
      : null;
  const amountHint = !selectedStudent
    ? null
    : selectedStudent.due === null
      ? { text: t('amountHintNoPlan'), tone: 'warning' as const }
      : selectedStudent.paid === 0
        ? {
            text: t('amountHintTotalDue', { amount: fmtAmount(selectedStudent.due, locale) }),
            tone: 'info' as const,
          }
        : remaining !== null && remaining > 0
          ? {
              text: t('amountHintRemaining', { amount: fmtAmount(remaining, locale) }),
              tone: 'info' as const,
            }
          : { text: t('amountHintSettled'), tone: 'warning' as const };
  const enteredAmount = Number(montant);
  const showsOverRemainingWarning =
    !isEdit &&
    remaining !== null &&
    remaining > 0 &&
    Number.isFinite(enteredAmount) &&
    enteredAmount > remaining;

  function resetForm() {
    setStudentId('');
    setPeriode('T1');
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
      const body = { studentId, periode, montant: amount, moyenPaiement };
      if (isEdit) {
        await api(`/api/accounting/tuition/${paymentId}`, { method: 'PATCH', body });
        toast(tc('paymentUpdatedToast'), 'success');
        router.push('/accounting/tuition');
      } else {
        await api('/api/accounting/tuition', { method: 'POST', body });
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
            onChange={(e) => setStudentId(e.target.value)}
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
              {t('dueDateLabel')}
            </label>
            <select
              value={periode}
              onChange={(e) => setPeriode(e.target.value as (typeof PERIODE_VALUES)[number])}
              className={fieldClass}
            >
              {PERIODES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
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
            {amountHint && (
              <p
                className={`text-xs mt-1.5 ${amountHint.tone === 'warning' ? 'text-warning' : 'text-muted-foreground'}`}
              >
                {amountHint.text}
              </p>
            )}
            {showsOverRemainingWarning && remaining !== null && (
              <p className="text-xs mt-1.5 text-warning">
                {t('amountExceedsRemainingWarning', { amount: fmtAmount(remaining, locale) })}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {tc('paymentMethodLabel')}
          </label>
          <select
            value={moyenPaiement}
            onChange={(e) => setMoyenPaiement(e.target.value as (typeof MOYENS)[number]['value'])}
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
                router.push('/accounting/tuition');
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

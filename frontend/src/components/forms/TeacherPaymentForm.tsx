'use client';

// "+ Enregistrer un paiement" panel on Comptabilité > Paiement des
// enseignants. Posts to /api/accounting/teacher-payments. Teachers here are
// paid by the hour according to their emploi du temps, so selecting one
// auto-calculates the montant as heures/semaine × 4 semaines × taux
// horaire — a starting estimate, not a lock: the field stays editable for
// part-time weeks, absences, or any manual correction. The backend rejects
// a second payment for the same teacher+month outright (see the
// @@unique constraint on TeacherPayment).

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface PayableTeacher {
  id: string;
  nom: string;
  prenom: string;
  tauxHoraire: number | null;
  weeklyHours: number;
  /** Hours this month deducted for marked absences — see Fiche enseignant > Absences. */
  absentHours: number;
  /** Outstanding (EN_COURS) salary advance flagged against THIS month — see Avances sur salaire. */
  outstandingAdvance: number;
}

export interface TeacherPaymentInitialData {
  teacherId: string;
  periode: string;
  montant: string;
  moyenPaiement: 'ESPECES' | 'ORANGE_MONEY' | 'VIREMENT';
}

const WEEKS_PER_MONTH = 4;

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

const MOYEN_VALUES = ['ESPECES', 'ORANGE_MONEY', 'VIREMENT'] as const;

// Maps the stable `error` codes the backend returns (see
// /api/accounting/teacher-payments{,/[id]}) to the matching translation key
// in `accounting.teacherPayments.form` / `accounting.common`, so a server
// error always reads in the app's current language instead of leaking a
// raw code like "ALREADY_PAID" — same pattern as login/page.tsx.
const FORM_ERROR_KEYS: Record<string, string> = {
  ALREADY_PAID: 'errorAlreadyPaid',
  TEACHER_NOT_FOUND: 'errorTeacherNotFound',
};
const COMMON_ERROR_KEYS: Record<string, string> = {
  PAYMENT_NOT_FOUND: 'errorPaymentNotFound',
};

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function estimateMontant(teacher: PayableTeacher | null): string {
  if (!teacher?.tauxHoraire || !teacher.weeklyHours) return '';
  const paidHours = Math.max(0, teacher.weeklyHours * WEEKS_PER_MONTH - teacher.absentHours);
  const gross = Math.round(paidHours * teacher.tauxHoraire);
  return String(Math.max(0, gross - teacher.outstandingAdvance));
}

export default function TeacherPaymentForm({
  teachers,
  paymentId,
  initialData,
}: {
  teachers: PayableTeacher[];
  /** When provided, the form edits this payment (PATCH) instead of creating one (POST). */
  paymentId?: string;
  initialData?: TeacherPaymentInitialData;
}) {
  const t = useTranslations('accounting.teacherPayments.form');
  const tc = useTranslations('accounting.common');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(paymentId);
  const [open, setOpen] = useState(isEdit);
  const [teacherId, setTeacherId] = useState(initialData?.teacherId ?? '');
  const [periode, setPeriode] = useState(initialData?.periode ?? currentMonthValue());
  const [montant, setMontant] = useState(initialData?.montant ?? '');
  const [montantAuto, setMontantAuto] = useState(!isEdit);
  const [moyenPaiement, setMoyenPaiement] = useState<(typeof MOYEN_VALUES)[number]>(
    initialData?.moyenPaiement ?? 'ESPECES',
  );
  const MOYENS = MOYEN_VALUES.map((value) => ({ value, label: tc(`methods.${value}`) }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === teacherId) ?? null,
    [teachers, teacherId],
  );

  function onTeacherChange(id: string) {
    setTeacherId(id);
    if (montantAuto) {
      const t = teachers.find((te) => te.id === id) ?? null;
      setMontant(estimateMontant(t));
    }
  }

  function resetForm() {
    setTeacherId('');
    setPeriode(currentMonthValue());
    setMontant('');
    setMontantAuto(true);
    setMoyenPaiement('ESPECES');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!teacherId) {
      setError(t('selectTeacherError'));
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
      const body = { teacherId, periode, montant: amount, moyenPaiement };
      if (isEdit) {
        await api(`/api/accounting/teacher-payments/${paymentId}`, { method: 'PATCH', body });
        toast(tc('paymentUpdatedToast'), 'success');
        router.push('/accounting/teacher-payments');
      } else {
        await api('/api/accounting/teacher-payments', { method: 'POST', body });
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
            {t('teacherLabel')}
          </label>
          <select
            value={teacherId}
            onChange={(e) => onTeacherChange(e.target.value)}
            required
            className={fieldClass}
          >
            <option value="">{t('selectTeacherPlaceholder')}</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.nom} {teacher.prenom}
                {teacher.tauxHoraire
                  ? ` — ${teacher.tauxHoraire.toLocaleString('fr-FR')} GNF/h`
                  : ''}
              </option>
            ))}
          </select>
          {selectedTeacher && !selectedTeacher.tauxHoraire && (
            <p className="text-xs text-muted-foreground mt-1">{t('noHourlyRateHint')}</p>
          )}
          {selectedTeacher?.tauxHoraire && montantAuto && (
            <p className="text-xs text-success mt-1">
              {t('autoCalculated', {
                hours: selectedTeacher.weeklyHours,
                weeks: WEEKS_PER_MONTH,
                rate: selectedTeacher.tauxHoraire.toLocaleString('fr-FR'),
              })}
            </p>
          )}
          {selectedTeacher && selectedTeacher.absentHours > 0 && (
            <p className="text-xs text-warning mt-1">
              {t('absentHoursHint', { hours: selectedTeacher.absentHours })}
            </p>
          )}
          {selectedTeacher && selectedTeacher.outstandingAdvance > 0 && (
            <p className="text-xs text-warning mt-1">
              {t('outstandingAdvanceHint', {
                amount: selectedTeacher.outstandingAdvance.toLocaleString('fr-FR'),
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
                router.push('/accounting/teacher-payments');
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
            disabled={submitting || teachers.length === 0}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting ? tCommon('saving') : isEdit ? tc('saveChanges') : tc('savePayment')}
          </button>
        </div>
      </form>
    </div>
  );
}

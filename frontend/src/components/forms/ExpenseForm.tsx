'use client';

// "+ Enregistrer une dépense" panel on Comptabilité > Dépenses. Posts to
// /api/accounting/expenses. The receipt photo (if any) is stored as a data
// URL, same approach as Student.photoUrl — no external file storage
// configured for this app.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export const EXPENSE_CATEGORY_VALUES = [
  'LOYER',
  'ELECTRICITE_EAU',
  'FOURNITURES',
  'ENTRETIEN',
  'TRANSPORT',
  'COMMUNICATION',
  'ALIMENTATION',
  'TAXES',
  'AUTRE',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORY_VALUES)[number];

export interface ExpenseInitialData {
  date: string; // yyyy-mm-dd
  categorie: ExpenseCategory;
  description: string;
  montant: string;
  moyenPaiement: 'ESPECES' | 'ORANGE_MONEY' | 'VIREMENT';
  beneficiaire: string;
  receiptUrl: string;
}

const MAX_RECEIPT_BYTES = 500_000;

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

const MOYEN_VALUES = ['ESPECES', 'ORANGE_MONEY', 'VIREMENT'] as const;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseForm({
  expenseId,
  initialData,
}: {
  /** When provided, the form edits this expense (PATCH) instead of creating one (POST). */
  expenseId?: string;
  initialData?: ExpenseInitialData;
}) {
  const t = useTranslations('accounting.expenses.form');
  const tCat = useTranslations('accounting.expenses.categories');
  const tc = useTranslations('accounting.common');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(expenseId);
  const [open, setOpen] = useState(isEdit);
  const [date, setDate] = useState(initialData?.date ?? todayValue());
  const [categorie, setCategorie] = useState<ExpenseCategory>(initialData?.categorie ?? 'AUTRE');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [montant, setMontant] = useState(initialData?.montant ?? '');
  const [moyenPaiement, setMoyenPaiement] = useState<(typeof MOYEN_VALUES)[number]>(
    initialData?.moyenPaiement ?? 'ESPECES',
  );
  const [beneficiaire, setBeneficiaire] = useState(initialData?.beneficiaire ?? '');
  const [receiptUrl, setReceiptUrl] = useState(initialData?.receiptUrl ?? '');
  const [receiptFileName, setReceiptFileName] = useState('');
  const MOYENS = MOYEN_VALUES.map((value) => ({ value, label: tc(`methods.${value}`) }));
  const CATEGORIES = EXPENSE_CATEGORY_VALUES.map((value) => ({
    value,
    label: tCat(value),
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_RECEIPT_BYTES) {
      setError(t('errorReceiptTooLarge'));
      return;
    }
    setError(null);
    const dataUrl = await readFileAsDataUrl(file);
    setReceiptUrl(dataUrl);
    setReceiptFileName(file.name);
  }

  function onRemoveReceipt() {
    setReceiptUrl('');
    setReceiptFileName('');
  }

  function resetForm() {
    setDate(todayValue());
    setCategorie('AUTRE');
    setDescription('');
    setMontant('');
    setMoyenPaiement('ESPECES');
    setBeneficiaire('');
    setReceiptUrl('');
    setReceiptFileName('');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError(t('errorDescriptionRequired'));
      return;
    }
    const amount = Number(montant);
    if (!amount || amount <= 0) {
      setError(tc('invalidAmountError'));
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        date: new Date(date).toISOString(),
        categorie,
        description: description.trim(),
        montant: amount,
        moyenPaiement,
        ...(beneficiaire.trim() ? { beneficiaire: beneficiaire.trim() } : {}),
        ...(receiptUrl ? { receiptUrl } : {}),
      };
      if (isEdit) {
        await api(`/api/accounting/expenses/${expenseId}`, { method: 'PATCH', body });
        toast(tc('paymentUpdatedToast'), 'success');
        router.push('/accounting/expenses');
      } else {
        await api('/api/accounting/expenses', { method: 'POST', body });
        toast(t('savedToast'), 'success');
        resetForm();
        setOpen(false);
      }
      router.refresh();
    } catch (err) {
      let message = tCommon('networkError');
      if (err instanceof ApiError) {
        message = err.code === 'EXPENSE_NOT_FOUND' ? t('errorExpenseNotFound') : err.message;
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
              {t('categoryLabel')}
            </label>
            <select
              value={categorie}
              onChange={(e) => setCategorie(e.target.value as ExpenseCategory)}
              className={fieldClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('descriptionLabel')}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            required
            className={fieldClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            {t('beneficiaryLabel')}
          </label>
          <input
            type="text"
            value={beneficiaire}
            onChange={(e) => setBeneficiaire(e.target.value)}
            placeholder={t('beneficiaryPlaceholder')}
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('receiptLabel')}
          </label>
          <div className="border border-border rounded-md px-3 py-2 bg-input flex items-center gap-3">
            {receiptUrl && (
              // data: URL — next/image can't optimize it, a plain <img> is correct here.
              <img
                src={receiptUrl}
                alt={t('receiptAlt')}
                className="w-10 h-10 rounded-md object-cover border border-border flex-shrink-0"
              />
            )}
            <label className="px-3 py-1.5 text-xs font-semibold text-foreground border border-border rounded-md bg-surface cursor-pointer shrink-0">
              {t('chooseFile')}
              <input type="file" accept="image/*" onChange={onReceiptChange} className="hidden" />
            </label>
            <span className="text-sm text-muted-foreground truncate">
              {receiptFileName || (receiptUrl ? t('currentReceipt') : t('noFileChosen'))}
            </span>
            {receiptUrl && (
              <button
                type="button"
                onClick={onRemoveReceipt}
                className="text-xs font-semibold text-danger shrink-0 ml-auto"
              >
                {t('removeReceipt')}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{t('receiptHint')}</p>
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
                router.push('/accounting/expenses');
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

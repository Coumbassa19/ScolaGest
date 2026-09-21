'use client';

// Standalone "Supprimer" action for accounting payment rows. Unlike
// RowActions (students/teachers/subjects/classes), payment records have no
// edit page — a financial record is corrected by deleting and re-recording,
// not by editing in place — so this only ever needs the delete half.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';

// Maps the stable `error` codes the DELETE endpoints of the various payment
// resources (teacher-payments, salary-advances, staff-payments, expenses,
// tuition, registration) return to a translated message — this button is
// shared across all of them, so the only code that's ever meaningful here is
// "record no longer exists" (a race with another delete), same wording for
// every resource.
const ERROR_KEYS: Record<string, string> = {
  PAYMENT_NOT_FOUND: 'deleteNotFoundError',
  ADVANCE_NOT_FOUND: 'deleteNotFoundError',
  EXPENSE_NOT_FOUND: 'deleteNotFoundError',
};

export default function DeletePaymentButton({
  deleteUrl,
  confirmMessage,
}: {
  deleteUrl: string;
  confirmMessage: string;
}) {
  const t = useTranslations('common');
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm(confirmMessage)) return;
    setError(null);
    setDeleting(true);
    try {
      await api(deleteUrl, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        setError(key ? t(key as never) : err.message);
      } else {
        setError(t('networkError'));
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => void onDelete()}
        disabled={deleting}
        className="text-danger text-xs font-semibold disabled:opacity-50"
      >
        {deleting ? '…' : 'Supprimer'}
      </button>
      {error && <span className="text-xs text-danger text-center">{error}</span>}
    </div>
  );
}

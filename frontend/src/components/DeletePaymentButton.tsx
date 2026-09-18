'use client';

// Standalone "Supprimer" action for accounting payment rows. Unlike
// RowActions (students/teachers/subjects/classes), payment records have no
// edit page — a financial record is corrected by deleting and re-recording,
// not by editing in place — so this only ever needs the delete half.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export default function DeletePaymentButton({
  deleteUrl,
  confirmMessage,
}: {
  deleteUrl: string;
  confirmMessage: string;
}) {
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
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
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

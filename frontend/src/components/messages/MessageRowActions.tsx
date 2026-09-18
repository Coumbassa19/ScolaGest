'use client';

// Row actions for the "Messages" history page (src/app/messages) — resend
// (FAILED/UNAVAILABLE rows only, a direct companion to those statuses) and
// delete (always available; the history is otherwise append-only). Mirrors
// the app's established delete convention (window.confirm + DELETE + router
// refresh — see DeletePaymentButton) but adds a toast confirmation, per the
// "professional confirmation" ask for the Messages feature specifically.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Icon from '@/components/global/Icon';

const RETRYABLE_STATUSES = new Set(['FAILED', 'UNAVAILABLE']);

export default function MessageRowActions({
  id,
  status,
  size = 'md',
}: {
  id: string;
  status: string;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('messages.history');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'resend' | 'delete' | null>(null);

  const btnClass =
    size === 'sm'
      ? 'text-xs font-semibold disabled:opacity-50'
      : 'text-xs font-semibold disabled:opacity-50';

  async function onResend(): Promise<void> {
    setBusy('resend');
    try {
      const res = await api<{ result: { status: string } }>(`/api/messages/${id}/resend`, {
        method: 'POST',
        body: { locale },
      });
      if (res.result.status === 'SENT') {
        toast(t('resendSuccessToast'), 'success');
      } else {
        toast(t('resendFailedToast'), 'error');
      }
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('resendFailedToast'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(): Promise<void> {
    if (!window.confirm(t('deleteConfirm'))) return;
    setBusy('delete');
    try {
      await api(`/api/messages/${id}`, { method: 'DELETE' });
      toast(t('deleteSuccessToast'), 'success');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('deleteFailedToast'), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {RETRYABLE_STATUSES.has(status) && (
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={busy !== null}
          className={`${btnClass} text-primary inline-flex items-center gap-1`}
        >
          <Icon i="refresh-cw" size={12} />
          {busy === 'resend' ? t('resending') : t('resend')}
        </button>
      )}
      <button
        type="button"
        onClick={() => void onDelete()}
        disabled={busy !== null}
        className={`${btnClass} text-danger`}
      >
        {busy === 'delete' ? '…' : t('delete')}
      </button>
    </div>
  );
}

'use client';

// Suspend/Restore button for a row in the /settings "Utilisateurs" section.
// Calls the existing PATCH /api/admin/users/[id]/status — no new endpoint
// needed. A restore on a SUSPENDED account, or a suspend targeting a
// SUPERADMIN, can 403 (SUPERADMIN-only per that route) — surfaced as a
// toast rather than assumed away, since this component doesn't know the
// caller's own role.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function UserStatusToggle({
  userId,
  status,
}: {
  userId: string;
  status: string;
}) {
  const router = useRouter();
  const t = useTranslations('settings.users');
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const isActive = status === 'ACTIVE';

  async function onToggle() {
    const confirmMsg = isActive ? t('confirmSuspend') : t('confirmRestore');
    if (!window.confirm(confirmMsg)) return;

    setPending(true);
    try {
      await api(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: { status: isActive ? 'SUSPENDED' : 'ACTIVE' },
      });
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toggleError'), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      disabled={pending}
      className={`text-sm font-semibold disabled:opacity-50 ${isActive ? 'text-warning' : 'text-primary'}`}
    >
      {isActive ? t('suspend') : t('restore')}
    </button>
  );
}

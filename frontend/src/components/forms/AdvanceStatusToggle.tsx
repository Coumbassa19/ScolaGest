'use client';

// Mark-as-repaid toggle for a row on Comptabilité > Avances sur salaire.
// Calls PATCH /api/accounting/salary-advances/[id]. Always a manual action
// — see the SalaryAdvance model comment in schema.prisma for why repayment
// isn't inferred automatically from a payroll payment.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function AdvanceStatusToggle({
  advanceId,
  statut,
}: {
  advanceId: string;
  statut: string;
}) {
  const router = useRouter();
  const t = useTranslations('accounting.salaryAdvances.list');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const isEnCours = statut === 'EN_COURS';

  async function onToggle() {
    setPending(true);
    try {
      await api(`/api/accounting/salary-advances/${advanceId}`, {
        method: 'PATCH',
        body: { statut: isEnCours ? 'REMBOURSEE' : 'EN_COURS' },
      });
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('networkError'), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      disabled={pending}
      className={`text-xs font-semibold px-2 py-1 rounded-md disabled:opacity-50 ${
        isEnCours ? 'text-warning bg-warning/10' : 'text-success bg-success/10'
      }`}
    >
      {isEnCours ? t('markRepaid') : t('repaid')}
    </button>
  );
}

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';
import { api, ApiError } from '@/lib/api';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  TRIALING: { bg: 'bg-warning-bg', text: 'text-warning' },
  ACTIVE: { bg: 'bg-success-bg', text: 'text-success' },
  PAST_DUE: { bg: 'bg-danger-bg', text: 'text-danger' },
};

const STATUS_LABEL_KEY: Record<string, string> = {
  TRIALING: 'statusTrialing',
  ACTIVE: 'statusActive',
  PAST_DUE: 'statusPastDue',
};

export interface BillingPanelProps {
  status: string;
  isBlocked: boolean;
  planName: string;
  priceLabel: string;
  trialEndsAtLabel: string | null;
  periodEndLabel: string | null;
  initialBanner: 'paid' | 'failed' | null;
}

export default function BillingPanel({
  status,
  isBlocked,
  planName,
  priceLabel,
  trialEndsAtLabel,
  periodEndLabel,
  initialBanner,
}: BillingPanelProps) {
  const t = useTranslations('billing');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner] = useState(initialBanner);

  const style = STATUS_STYLES[status] ?? STATUS_STYLES.TRIALING!;
  const labelKey = STATUS_LABEL_KEY[status] ?? 'statusTrialing';

  async function onPay() {
    setError(null);
    setSubmitting(true);
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const res = await api<{ paymentUrl: string }>('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      window.location.assign(res.paymentUrl);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PAYMENT_PROVIDER_UNCONFIGURED') {
          setError(t('errorUnconfigured'));
        } else {
          setError(err.message || t('errorGeneric'));
        }
      } else {
        setError(t('errorNetwork'));
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {banner === 'paid' && (
        <div className="bg-success-bg border border-success rounded-lg px-4 py-3 flex items-start gap-3">
          <Icon i="circle-check" size={16} className="text-success flex-shrink-0 mt-0.5" />
          <p className="text-sm text-success">{t('paidBanner')}</p>
        </div>
      )}
      {banner === 'failed' && (
        <div className="bg-danger-bg border border-danger rounded-lg px-4 py-3 flex items-start gap-3">
          <Icon i="circle-alert" size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{t('failedBanner')}</p>
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-headings font-semibold text-foreground">{planName}</h2>
          <span
            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
          >
            {t(labelKey as never)}
          </span>
        </div>
        <p className="text-2xl font-headings font-semibold text-foreground">{priceLabel}</p>

        {status === 'TRIALING' && trialEndsAtLabel && (
          <p className="text-sm text-muted-foreground">
            {t('trialEndsLabel')} <span className="font-semibold text-foreground">{trialEndsAtLabel}</span>
          </p>
        )}
        {status === 'ACTIVE' && periodEndLabel && (
          <p className="text-sm text-muted-foreground">
            {t('periodEndLabel')} <span className="font-semibold text-foreground">{periodEndLabel}</span>
          </p>
        )}

        {isBlocked && (
          <div className="bg-danger-bg border border-danger rounded-md px-3 py-2">
            <p className="text-sm text-danger">{t('blockedMessage')}</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger bg-danger-bg border border-danger rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onPay}
          disabled={submitting}
          className="w-full sm:w-auto px-6 py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-lg disabled:opacity-50"
        >
          {submitting ? t('paying') : t('payButton')}
        </button>
      </div>
    </div>
  );
}

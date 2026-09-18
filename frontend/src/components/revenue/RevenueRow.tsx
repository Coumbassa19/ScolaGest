'use client';

// Expandable row for the revenue-received table. The "Detail" toggle opens an inline
// panel with the full payment record — read-only, no dedicated route needed
// since all the data is already loaded server-side by the parent page.

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';

export interface RevenueRowData {
  id: string;
  dateLabel: string;
  source: string;
  studentLabel: string;
  montant: number;
  statut: string;
  moyenPaiement: string;
}

export default function RevenueRow({ payment }: { payment: RevenueRowData }) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations('revenue.received');
  const locale = useLocale();
  const montantLabel = payment.montant.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR');

  return (
    <div className="border-b border-border">
      {/* Mobile: compact summary line — the expandable panel below already
          shows every field, so the collapsed row only needs enough to
          identify the payment and a way to open it. */}
      <div className="sm:hidden flex items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{payment.source}</p>
          <p className="text-xs text-muted-foreground truncate">
            {payment.dateLabel} · {payment.studentLabel}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-foreground">{montantLabel}</p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-primary text-xs font-semibold"
          >
            {expanded ? t('close') : t('detail')}
          </button>
        </div>
      </div>

      {/* Desktop: full grid row (sm and up) */}
      <div className="hidden sm:grid grid-cols-8 gap-3 px-5 py-3 items-center">
        <span className="text-sm font-semibold text-foreground">{payment.dateLabel}</span>
        <div className="col-span-2">
          <p className="text-sm font-semibold text-foreground">{payment.source}</p>
        </div>
        <span className="text-sm text-muted-foreground">{payment.studentLabel}</span>
        <span className="text-sm font-semibold text-foreground text-right">{montantLabel}</span>
        <div className="flex">
          <span className="inline-block px-2 py-1 rounded-md text-xs font-semibold text-success bg-success/10 border border-success/20">
            {payment.statut}
          </span>
        </div>
        <span className="text-xs text-muted-foreground text-center">{payment.moyenPaiement}</span>
        <div className="text-right">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-primary text-xs font-semibold"
          >
            {expanded ? t('close') : t('detail')}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-4 -mt-1">
          <div className="bg-muted rounded-md p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t('headerDate')}
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{payment.dateLabel}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t('headerSource')}
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{payment.source}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t('headerStudent')}
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {payment.studentLabel}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t('headerAmount')}
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{montantLabel}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t('detailPaymentMethod')}
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {payment.moyenPaiement}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t('headerStatus')}
              </p>
              <p className="text-sm font-semibold text-success mt-0.5">{payment.statut}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import RevenueRow from '@/components/revenue/RevenueRow';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Revenus reçus',
};

function fmtDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function RevenueReceivedPage() {
  // No dedicated 'revenue' menu key (see menu-keys.ts) — this is the same
  // accounting/revenue concern as everything under /accounting, so it's
  // gated the same way.
  const staff = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('revenue.received');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const payments = await prisma.revenuePayment.findMany({
    where: { date: { gte: startOfMonth } },
    include: { student: true },
    orderBy: { date: 'desc' },
  });

  const total = payments.reduce((sum, p) => sum + p.montant, 0);
  const average = payments.length > 0 ? Math.round(total / payments.length) : 0;

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="dashboard" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {tCommon('backToDashboard')}
          </Link>
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
                {t('title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
            </div>
            <Link
              href="/new-revenue"
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md flex items-center gap-2"
            >
              <Icon i="plus" size={16} />
              {t('newPayment')}
            </Link>
          </div>
        </div>

        {/* Summary stats */}
        <div className="px-4 py-4 md:px-8 border-b border-border flex flex-wrap gap-4 md:gap-10">
          <div>
            <span className="text-2xl font-headings font-semibold text-foreground">
              {total.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">{t('statTotalReceived')}</p>
          </div>
          <div className="w-px bg-border"></div>
          <div>
            <span className="text-2xl font-headings font-semibold text-success">
              {payments.length}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">{t('statPaymentsThisMonth')}</p>
          </div>
          <div className="w-px bg-border"></div>
          <div>
            <span className="text-2xl font-headings font-semibold text-foreground">
              {average.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">{t('statAveragePerPayment')}</p>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          {payments.length === 0 ? (
            <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {t('noPayments')}{' '}
              <Link href="/new-revenue" className="text-primary font-semibold">
                {t('recordPayment')}
              </Link>
            </div>
          ) : (
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <div className="sm:min-w-[860px]">
                  {/* Header (sm and up — the mobile row is its own compact summary) */}
                  <div className="hidden sm:grid grid-cols-8 gap-3 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerDate')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                      {t('headerSource')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerStudent')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
                      {t('headerAmount')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerStatus')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                      {t('headerMethod')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
                      {t('headerActions')}
                    </span>
                  </div>

                  {/* Rows */}
                  <div>
                    {payments.map((r) => (
                      <RevenueRow
                        key={r.id}
                        payment={{
                          id: r.id,
                          dateLabel: fmtDate(r.date, locale),
                          source: r.source,
                          studentLabel: r.student ? `${r.student.nom} ${r.student.prenom}` : '—',
                          montant: r.montant,
                          statut: r.statut,
                          moyenPaiement: r.moyenPaiement,
                        }}
                      />
                    ))}
                  </div>

                  {/* Footer (sm and up) */}
                  <div className="hidden sm:grid grid-cols-8 gap-3 px-5 py-3 bg-muted border-t border-border items-center font-semibold">
                    <span></span>
                    <span className="col-span-3 text-foreground">{t('total')}</span>
                    <span className="text-right text-foreground">
                      {total.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')}
                    </span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

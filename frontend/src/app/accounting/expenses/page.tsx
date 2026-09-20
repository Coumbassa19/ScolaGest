import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import RowActions from '@/components/RowActions';
import ExpenseForm from '@/components/forms/ExpenseForm';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Dépenses',
};

function fmt(n: number, locale: string): string {
  return n.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR');
}

function fmtDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function ExpensesAccountingPage() {
  const staff = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('accounting.expenses.list');
  const tCat = await getTranslations('accounting.expenses.categories');
  const tc = await getTranslations('accounting.common');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [recentExpenses, monthExpenses, yearExpenses] = await Promise.all([
    prisma.expense.findMany({
      orderBy: { date: 'desc' },
      take: 200,
    }),
    prisma.expense.findMany({
      where: { date: { gte: startOfMonth } },
      select: { montant: true },
    }),
    prisma.expense.findMany({
      where: { date: { gte: startOfYear } },
      select: { montant: true },
    }),
  ]);

  const totalCeMois = monthExpenses.reduce((sum, e) => sum + e.montant, 0);
  const totalCetteAnnee = yearExpenses.reduce((sum, e) => sum + e.montant, 0);
  const nbCeMois = monthExpenses.length;

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-expenses"
        expandedMenu="accounting"
      />

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
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
                {t('title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
            </div>
            <ExpenseForm />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-danger">
                  {fmt(totalCeMois, locale)} <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statThisMonth')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-foreground">
                  {fmt(totalCetteAnnee, locale)} <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statThisYear')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-foreground">{nbCeMois}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('statCountThisMonth')}</p>
              </div>
            </div>

            {/* History */}
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-5 py-3 bg-muted border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">{t('historyTitle')}</h2>
              </div>

              {/* Mobile: stacked cards (below sm) */}
              <div className="sm:hidden">
                <MobileCardList
                  items={recentExpenses}
                  keyFor={(e) => e.id}
                  emptyMessage={t('noExpenses')}
                  renderCard={(e) => (
                    <>
                      <div>
                        <div className="font-semibold text-foreground text-sm">{e.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(e.date, locale)} — {tCat(e.categorie as never)}
                        </div>
                      </div>
                      <CardField
                        label={t('headerAmount')}
                        value={`${fmt(e.montant, locale)} GNF`}
                      />
                      <CardField
                        label={t('headerMethod')}
                        value={tc(`methods.${e.moyenPaiement}`)}
                      />
                      {e.beneficiaire && (
                        <CardField label={t('headerBeneficiary')} value={e.beneficiaire} />
                      )}
                      <div className="pt-1.5 flex justify-end">
                        <RowActions
                          editHref={`/accounting/expenses/${e.id}`}
                          deleteUrl={`/api/accounting/expenses/${e.id}`}
                          confirmMessage={t('deleteConfirm', { description: e.description })}
                        />
                      </div>
                    </>
                  )}
                />
              </div>

              {/* Desktop: grid table (sm and up) */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-[820px]">
                  <div className="grid grid-cols-7 gap-3 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerDate')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerCategory')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                      {t('headerDescription')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerAmount')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerMethod')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                      {tc('headerActions')}
                    </span>
                  </div>

                  {recentExpenses.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {t('noExpenses')}
                    </div>
                  ) : (
                    <div>
                      {recentExpenses.map((e) => (
                        <div
                          key={e.id}
                          className="grid grid-cols-7 gap-3 px-5 py-3 border-b border-border items-center hover:bg-input"
                        >
                          <span className="text-sm text-muted-foreground">
                            {fmtDate(e.date, locale)}
                          </span>
                          <span className="text-sm text-foreground">
                            {tCat(e.categorie as never)}
                          </span>
                          <span className="col-span-2 text-sm font-semibold text-foreground">
                            {e.description}
                            {e.beneficiaire && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {e.beneficiaire}
                              </span>
                            )}
                          </span>
                          <span className="text-sm font-semibold text-danger">
                            {fmt(e.montant, locale)} GNF
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {tc(`methods.${e.moyenPaiement}`)}
                          </span>
                          <RowActions
                            editHref={`/accounting/expenses/${e.id}`}
                            deleteUrl={`/api/accounting/expenses/${e.id}`}
                            confirmMessage={t('deleteConfirm', { description: e.description })}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

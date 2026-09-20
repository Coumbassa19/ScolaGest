import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import RowActions from '@/components/RowActions';
import AdvanceForm from '@/components/forms/AdvanceForm';
import AdvanceStatusToggle from '@/components/forms/AdvanceStatusToggle';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Avances sur salaire',
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

function fmtPeriode(periode: string, locale: string): string {
  const [year, month] = periode.split('-');
  if (!year || !month) return periode;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

function personName(a: {
  teacher: { nom: string; prenom: string } | null;
  staff: { nom: string; prenom: string } | null;
}): string {
  const p = a.teacher ?? a.staff;
  return p ? `${p.nom} ${p.prenom}` : '—';
}

export default async function SalaryAdvancesAccountingPage() {
  const auth = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = auth.user.prisma;

  const t = await getTranslations('accounting.salaryAdvances.list');
  const tc = await getTranslations('accounting.common');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();

  const [teachers, staffMembers, advances] = await Promise.all([
    prisma.teacher.findMany({
      select: { id: true, nom: true, prenom: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
    prisma.staff.findMany({
      select: { id: true, nom: true, prenom: true, poste: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
    prisma.salaryAdvance.findMany({
      include: { teacher: true, staff: true },
      orderBy: { date: 'desc' },
      take: 200,
    }),
  ]);

  const enCours = advances.filter((a) => a.statut === 'EN_COURS');
  const totalEnCours = enCours.reduce((sum, a) => sum + a.montant, 0);

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-salary-advances"
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
            <AdvanceForm teachers={teachers} staff={staffMembers} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-warning">
                  {fmt(totalEnCours, locale)} <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statOutstanding')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-foreground">
                  {enCours.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statCountOutstanding')}</p>
              </div>
            </div>

            {/* History */}
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-5 py-3 bg-muted border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">{t('historyTitle')}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t('historyHint')}</p>
              </div>

              {/* Mobile: stacked cards (below sm) */}
              <div className="sm:hidden">
                <MobileCardList
                  items={advances}
                  keyFor={(a) => a.id}
                  emptyMessage={t('noAdvances')}
                  renderCard={(a) => (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {personName(a)}
                        </span>
                        <AdvanceStatusToggle advanceId={a.id} statut={a.statut} />
                      </div>
                      <CardField label={t('headerDate')} value={fmtDate(a.date, locale)} />
                      <CardField
                        label={t('headerAmount')}
                        value={`${fmt(a.montant, locale)} GNF`}
                      />
                      <CardField
                        label={t('headerPeriode')}
                        value={fmtPeriode(a.periodeAAffecter, locale)}
                      />
                      <div className="pt-1.5 flex justify-end">
                        <RowActions
                          editHref={`/accounting/salary-advances/${a.id}`}
                          deleteUrl={`/api/accounting/salary-advances/${a.id}`}
                          confirmMessage={t('deleteConfirm', { name: personName(a) })}
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
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                      {t('headerPerson')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerDate')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerAmount')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerPeriode')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerStatus')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                      {tc('headerActions')}
                    </span>
                  </div>

                  {advances.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {t('noAdvances')}
                    </div>
                  ) : (
                    <div>
                      {advances.map((a) => (
                        <div
                          key={a.id}
                          className="grid grid-cols-7 gap-3 px-5 py-3 border-b border-border items-center hover:bg-input"
                        >
                          <span className="col-span-2 text-sm font-semibold text-foreground">
                            {personName(a)}
                            {a.motif && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {a.motif}
                              </span>
                            )}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {fmtDate(a.date, locale)}
                          </span>
                          <span className="text-sm font-semibold text-foreground">
                            {fmt(a.montant, locale)} GNF
                          </span>
                          <span className="text-sm text-muted-foreground capitalize">
                            {fmtPeriode(a.periodeAAffecter, locale)}
                          </span>
                          <AdvanceStatusToggle advanceId={a.id} statut={a.statut} />
                          <RowActions
                            editHref={`/accounting/salary-advances/${a.id}`}
                            deleteUrl={`/api/accounting/salary-advances/${a.id}`}
                            confirmMessage={t('deleteConfirm', { name: personName(a) })}
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

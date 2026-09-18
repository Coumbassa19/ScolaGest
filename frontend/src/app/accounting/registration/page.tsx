import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import RowActions from '@/components/RowActions';
import RegistrationPaymentForm from '@/components/forms/RegistrationPaymentForm';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Inscription & Réinscription',
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

export default async function RegistrationAccountingPage() {
  const staff = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('accounting.registration.list');
  const tc = await getTranslations('accounting.common');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const [students, payments] = await Promise.all([
    prisma.student.findMany({
      include: { schoolClass: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
    prisma.revenuePayment.findMany({
      where: { categorie: { in: ['INSCRIPTION', 'REINSCRIPTION'] } },
      include: { student: { include: { schoolClass: true } } },
      orderBy: { date: 'desc' },
      take: 200,
    }),
  ]);

  const totalInscriptions = payments
    .filter((p) => p.categorie === 'INSCRIPTION')
    .reduce((sum, p) => sum + p.montant, 0);
  const totalReinscriptions = payments
    .filter((p) => p.categorie === 'REINSCRIPTION')
    .reduce((sum, p) => sum + p.montant, 0);
  const nbAnciens = students.filter((s) => s.statut === 'ANCIEN').length;
  const nbNouveaux = students.length - nbAnciens;

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-registration"
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
            <RegistrationPaymentForm
              students={students.map((s) => ({
                id: s.id,
                nom: s.nom,
                prenom: s.prenom,
                matricule: s.matricule,
                className: s.schoolClass.name,
                statut: s.statut,
              }))}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-foreground">
                  {fmt(totalInscriptions, locale)} <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statTotalInscriptions')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-foreground">
                  {fmt(totalReinscriptions, locale)} <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statTotalReinscriptions')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-primary">{nbNouveaux}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('statNewStudents')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-primary">{nbAnciens}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('statFormerStudents')}</p>
              </div>
            </div>

            {/* Payments table */}
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-5 py-3 bg-muted border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">{t('historyTitle')}</h2>
              </div>
              {/* Mobile: stacked cards (below sm) */}
              <div className="sm:hidden">
                <MobileCardList
                  items={payments}
                  keyFor={(p) => p.id}
                  emptyMessage={t('noPayments')}
                  renderCard={(p) => (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-foreground text-sm">
                            {p.student ? `${p.student.nom} ${p.student.prenom}` : '—'}
                          </div>
                          {p.student && (
                            <div className="text-xs text-muted-foreground">
                              {p.student.schoolClass.name}
                            </div>
                          )}
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 px-2 py-1 rounded-md ${
                            p.categorie === 'REINSCRIPTION'
                              ? 'text-accent bg-secondary'
                              : 'text-success bg-success/10'
                          }`}
                        >
                          {p.categorie === 'REINSCRIPTION' ? t('typeReinscription') : t('typeInscription')}
                        </span>
                      </div>
                      <CardField label={t('headerAmount')} value={`${fmt(p.montant, locale)} GNF`} />
                      <CardField label={t('headerMethod')} value={tc(`methods.${p.moyenPaiement}`)} />
                      <CardField label={t('headerDate')} value={fmtDate(p.date, locale)} />
                      <div className="pt-1.5 flex items-center justify-end gap-4">
                        <Link
                          href={`/accounting/receipt/${p.id}`}
                          className="flex items-center gap-1 text-primary text-xs font-semibold"
                        >
                          <Icon i="receipt" size={13} />
                          {tc('viewReceiptLabel')}
                        </Link>
                        <RowActions
                          editHref={`/accounting/registration/${p.id}`}
                          deleteUrl={`/api/accounting/registration/${p.id}`}
                          confirmMessage={t('deleteConfirm')}
                        />
                      </div>
                    </>
                  )}
                />
              </div>

              {/* Desktop: grid table (sm and up) */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-7 gap-3 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                      {t('headerStudent')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerType')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerAmount')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerMethod')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerDate')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                      {tc('headerActions')}
                    </span>
                  </div>

                  {payments.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {t('noPayments')}
                    </div>
                  ) : (
                    <div>
                      {payments.map((p) => (
                        <div
                          key={p.id}
                          className="grid grid-cols-7 gap-3 px-5 py-3 border-b border-border items-center hover:bg-input"
                        >
                          <span className="col-span-2 text-sm font-semibold text-foreground">
                            {p.student ? `${p.student.nom} ${p.student.prenom}` : '—'}
                            {p.student && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {p.student.schoolClass.name}
                              </span>
                            )}
                          </span>
                          <span
                            className={`text-xs font-semibold w-fit px-2 py-1 rounded-md ${
                              p.categorie === 'REINSCRIPTION'
                                ? 'text-accent bg-secondary'
                                : 'text-success bg-success/10'
                            }`}
                          >
                            {p.categorie === 'REINSCRIPTION'
                              ? t('typeReinscription')
                              : t('typeInscription')}
                          </span>
                          <span className="text-sm font-semibold text-foreground">
                            {fmt(p.montant, locale)} GNF
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {tc(`methods.${p.moyenPaiement}`)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {fmtDate(p.date, locale)}
                          </span>
                          <div className="flex flex-col items-center gap-1.5">
                            <Link
                              href={`/accounting/receipt/${p.id}`}
                              className="flex items-center gap-1 text-primary text-xs font-semibold"
                            >
                              <Icon i="receipt" size={13} />
                              {tc('viewReceiptLabel')}
                            </Link>
                            <RowActions
                              editHref={`/accounting/registration/${p.id}`}
                              deleteUrl={`/api/accounting/registration/${p.id}`}
                              confirmMessage={t('deleteConfirm')}
                            />
                          </div>
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

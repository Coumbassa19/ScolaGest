import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import RowActions from '@/components/RowActions';
import StaffPaymentForm from '@/components/forms/StaffPaymentForm';
import AddStaffForm from '@/components/forms/AddStaffForm';
import EditableStaffSalaryCell from '@/components/forms/EditableStaffSalaryCell';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Paiement des personnels',
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

export default async function StaffPaymentsAccountingPage() {
  const staffAuth = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staffAuth.user.prisma;

  const t = await getTranslations('accounting.staffPayments.list');
  const tc = await getTranslations('accounting.common');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [staffMembers, recentPayments, yearPayments] = await Promise.all([
    prisma.staff.findMany({ orderBy: [{ nom: 'asc' }, { prenom: 'asc' }] }),
    prisma.staffPayment.findMany({
      include: { staff: true },
      orderBy: { datePaiement: 'desc' },
      take: 200,
    }),
    prisma.staffPayment.findMany({
      where: { datePaiement: { gte: startOfYear } },
      select: { staffId: true, montant: true, periode: true },
    }),
  ]);

  const paidThisYearByStaff = new Map<string, number>();
  const paidThisMonthByStaff = new Set<string>();
  for (const p of yearPayments) {
    paidThisYearByStaff.set(p.staffId, (paidThisYearByStaff.get(p.staffId) ?? 0) + p.montant);
    if (p.periode === currentMonth) paidThisMonthByStaff.add(p.staffId);
  }

  // Fixed monthly salaries — unlike teachers, staff aren't paid by the hour,
  // so the payroll estimate is simply the sum of everyone's salaireMensuel.
  const totalMasseSalarialeMensuelle = staffMembers.reduce((sum, s) => sum + s.salaireMensuel, 0);
  const totalPayeCeMois = recentPayments
    .filter((p) => p.periode === currentMonth)
    .reduce((sum, p) => sum + p.montant, 0);
  const nbPersonnelPayesCeMois = paidThisMonthByStaff.size;
  const nbPersonnelEnAttente = staffMembers.length - nbPersonnelPayesCeMois;

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-staff-payments"
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
              <p className="text-sm text-muted-foreground mt-1">
                {t('subtitle', { month: fmtPeriode(currentMonth, locale) })}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <AddStaffForm />
              <StaffPaymentForm
                staff={staffMembers.map((s) => ({
                  id: s.id,
                  nom: s.nom,
                  prenom: s.prenom,
                  poste: s.poste,
                  salaireMensuel: s.salaireMensuel,
                }))}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-foreground">
                  {fmt(totalMasseSalarialeMensuelle, locale)}{' '}
                  <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statMonthlyPayroll')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-success">
                  {fmt(totalPayeCeMois, locale)} <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statPaidThisMonth')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-success">
                  {nbPersonnelPayesCeMois}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statStaffPaid')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-warning">
                  {nbPersonnelEnAttente}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statStaffPending')}</p>
              </div>
            </div>

            {/* Per-staff status */}
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-5 py-3 bg-muted border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('statusSectionTitle', { month: fmtPeriode(currentMonth, locale) })}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">{t('statusSectionHint')}</p>
              </div>
              {/* Mobile: stacked cards (below sm) */}
              <div className="sm:hidden">
                <MobileCardList
                  items={staffMembers}
                  keyFor={(s) => s.id}
                  emptyMessage={t('noStaff')}
                  renderCard={(s) => (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {s.nom} {s.prenom}
                        </span>
                        <span
                          className={`text-xs font-semibold shrink-0 px-2 py-1 rounded-md ${
                            paidThisMonthByStaff.has(s.id)
                              ? 'text-success bg-success/10'
                              : 'text-warning bg-warning/10'
                          }`}
                        >
                          {paidThisMonthByStaff.has(s.id) ? t('paid') : t('unpaid')}
                        </span>
                      </div>
                      <CardField label={t('headerPoste')} value={s.poste} />
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                          {t('headerSalary')}
                        </span>
                        <EditableStaffSalaryCell staffId={s.id} salaireMensuel={s.salaireMensuel} />
                      </div>
                      <CardField
                        label={t('headerPaidThisYear')}
                        value={`${fmt(paidThisYearByStaff.get(s.id) ?? 0, locale)} GNF`}
                      />
                    </>
                  )}
                />
              </div>

              {/* Desktop: grid table (sm and up) */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-6 gap-3 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                      {t('headerStaff')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerPoste')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerSalary')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerPaidThisYear')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerStatusThisMonth')}
                    </span>
                  </div>
                  {staffMembers.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {t('noStaff')}
                    </div>
                  ) : (
                    <div>
                      {staffMembers.map((s) => (
                        <div
                          key={s.id}
                          className="grid grid-cols-6 gap-3 px-5 py-3 border-b border-border items-center hover:bg-input"
                        >
                          <span className="col-span-2 text-sm font-semibold text-foreground">
                            {s.nom} {s.prenom}
                          </span>
                          <span className="text-sm text-muted-foreground">{s.poste}</span>
                          <EditableStaffSalaryCell
                            staffId={s.id}
                            salaireMensuel={s.salaireMensuel}
                          />
                          <span className="text-sm text-foreground">
                            {fmt(paidThisYearByStaff.get(s.id) ?? 0, locale)} GNF
                          </span>
                          <span
                            className={`text-xs font-semibold w-fit px-2 py-1 rounded-md ${
                              paidThisMonthByStaff.has(s.id)
                                ? 'text-success bg-success/10'
                                : 'text-warning bg-warning/10'
                            }`}
                          >
                            {paidThisMonthByStaff.has(s.id) ? t('paid') : t('unpaid')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Payment history */}
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-5 py-3 bg-muted border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">{t('historyTitle')}</h2>
              </div>
              {/* Mobile: stacked cards (below sm) */}
              <div className="sm:hidden">
                <MobileCardList
                  items={recentPayments}
                  keyFor={(p) => p.id}
                  emptyMessage={t('noPayments')}
                  renderCard={(p) => (
                    <>
                      <div>
                        <div className="font-semibold text-foreground text-sm">
                          {p.staff.nom} {p.staff.prenom}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(p.datePaiement, locale)}
                        </div>
                      </div>
                      <CardField
                        label={t('headerMonthPaid')}
                        value={fmtPeriode(p.periode, locale)}
                      />
                      <CardField
                        label={t('headerAmount')}
                        value={`${fmt(p.montant, locale)} GNF`}
                      />
                      <CardField
                        label={t('headerMethod')}
                        value={tc(`methods.${p.moyenPaiement}`)}
                      />
                      <div className="pt-1.5 flex justify-end">
                        <RowActions
                          editHref={`/accounting/staff-payments/${p.id}`}
                          deleteUrl={`/api/accounting/staff-payments/${p.id}`}
                          confirmMessage={t('deleteConfirm', {
                            name: `${p.staff.nom} ${p.staff.prenom}`,
                          })}
                        />
                      </div>
                    </>
                  )}
                />
              </div>

              {/* Desktop: grid table (sm and up) */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-[700px]">
                  <div className="grid grid-cols-6 gap-3 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                      {t('headerStaff')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerMonthPaid')}
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

                  {recentPayments.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {t('noPayments')}
                    </div>
                  ) : (
                    <div>
                      {recentPayments.map((p) => (
                        <div
                          key={p.id}
                          className="grid grid-cols-6 gap-3 px-5 py-3 border-b border-border items-center hover:bg-input"
                        >
                          <span className="col-span-2 text-sm font-semibold text-foreground">
                            {p.staff.nom} {p.staff.prenom}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {fmtDate(p.datePaiement, locale)}
                            </span>
                          </span>
                          <span className="text-sm text-muted-foreground capitalize">
                            {fmtPeriode(p.periode, locale)}
                          </span>
                          <span className="text-sm font-semibold text-foreground">
                            {fmt(p.montant, locale)} GNF
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {tc(`methods.${p.moyenPaiement}`)}
                          </span>
                          <RowActions
                            editHref={`/accounting/staff-payments/${p.id}`}
                            deleteUrl={`/api/accounting/staff-payments/${p.id}`}
                            confirmMessage={t('deleteConfirm', {
                              name: `${p.staff.nom} ${p.staff.prenom}`,
                            })}
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

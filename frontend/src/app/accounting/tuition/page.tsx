import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import ClassFilterSelect from '@/components/ClassFilterSelect';
import RowActions from '@/components/RowActions';
import TuitionPaymentForm from '@/components/forms/TuitionPaymentForm';
import TuitionPlanPanel from '@/components/forms/TuitionPlanPanel';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Frais de scolarité',
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

export default async function TuitionAccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('accounting.tuition.list');
  const tc = await getTranslations('accounting.common');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const { classId } = await searchParams;

  const [currentYear, classes, students, recentPayments, paidAgg] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { label: true } }),
    prisma.schoolClass.findMany({
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
      include: { tuitionPlans: true },
    }),
    prisma.student.findMany({
      ...(classId ? { where: { classId } } : {}),
      include: { schoolClass: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
    prisma.revenuePayment.findMany({
      where: { categorie: 'SCOLARITE' },
      include: { student: { include: { schoolClass: true } } },
      orderBy: { date: 'desc' },
      take: 200,
    }),
    prisma.revenuePayment.groupBy({
      by: ['studentId'],
      where: { categorie: 'SCOLARITE', studentId: { not: null } },
      _sum: { montant: true },
    }),
  ]);

  const anneeScolaire = currentYear?.label ?? '2024-2025';

  const dueByClass = new Map<string, number>();
  for (const c of classes) {
    const plan = c.tuitionPlans.find((p) => p.anneeScolaire === anneeScolaire);
    if (plan) dueByClass.set(c.id, plan.montantAnnuel);
  }

  const paidByStudent = new Map<string, number>();
  for (const row of paidAgg) {
    if (row.studentId) paidByStudent.set(row.studentId, row._sum.montant ?? 0);
  }

  const rows = students.map((s) => {
    const due = dueByClass.get(s.classId) ?? null;
    const paid = paidByStudent.get(s.id) ?? 0;
    const reste = due !== null ? due - paid : null;
    const statusKey =
      due === null
        ? 'statusNotSet'
        : reste !== null && reste <= 0
          ? 'statusSettled'
          : paid > 0
            ? 'statusPartial'
            : 'statusUnpaid';
    return { student: s, due, paid, reste, statusKey };
  });

  const totalDue = rows.reduce((sum, r) => sum + (r.due ?? 0), 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.paid, 0);
  // Floored at zero for display: once every student's balance is settled
  // (or overpaid), the school-wide "remaining" figure should read 0, not a
  // negative amount that reads like the school owes money back.
  const totalReste = Math.max(0, totalDue - totalPaid);

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-tuition"
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
                {t('subtitle', { year: anneeScolaire })}
              </p>
            </div>
            <TuitionPaymentForm
              students={students.map((s) => ({
                id: s.id,
                nom: s.nom,
                prenom: s.prenom,
                matricule: s.matricule,
                className: s.schoolClass.name,
                due: dueByClass.get(s.classId) ?? null,
                paid: paidByStudent.get(s.id) ?? 0,
              }))}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-foreground">
                  {fmt(totalDue, locale)} <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statTotalDue')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-success">
                  {fmt(totalPaid, locale)} <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statTotalPaid')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-warning">
                  {fmt(totalReste, locale)} <span className="text-sm font-normal">GNF</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statTotalRemaining')}</p>
              </div>
            </div>

            {/* Fee schedule config */}
            <TuitionPlanPanel
              anneeScolaire={anneeScolaire}
              rows={classes.map((c) => ({
                classId: c.id,
                className: c.name,
                montantAnnuel: dueByClass.get(c.id) ?? null,
              }))}
            />

            {/* Filter */}
            <div className="flex flex-wrap items-center gap-2 md:gap-4 justify-between">
              <span className="text-sm font-semibold text-foreground px-1">
                {t('studentsCount', { count: rows.length })}
              </span>
              <div className="max-w-xs w-full sm:w-64">
                <ClassFilterSelect
                  classes={classes.map((c) => ({ id: c.id, name: c.name }))}
                  selected={classId ?? ''}
                  basePath="/accounting/tuition"
                />
              </div>
            </div>

            {/* Balance table */}
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              {/* Mobile: stacked cards (below sm) */}
              <div className="sm:hidden">
                <MobileCardList
                  items={rows}
                  keyFor={(row) => row.student.id}
                  emptyMessage={t('noStudents')}
                  renderCard={({ student, due, paid, reste, statusKey }) => {
                    const displayPaid = due !== null ? Math.min(paid, due) : paid;
                    const displayReste = reste !== null ? Math.max(0, reste) : null;
                    return (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-foreground text-sm">
                              {student.nom} {student.prenom}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {student.schoolClass.name}
                            </div>
                          </div>
                          <span
                            className={`text-xs font-semibold shrink-0 px-2 py-1 rounded-md ${
                              statusKey === 'statusSettled'
                                ? 'text-success bg-success/10'
                                : statusKey === 'statusPartial'
                                  ? 'text-warning bg-warning/10'
                                  : statusKey === 'statusUnpaid'
                                    ? 'text-danger bg-danger/10'
                                    : 'text-muted-foreground bg-muted'
                            }`}
                          >
                            {t(statusKey)}
                          </span>
                        </div>
                        <CardField
                          label={t('headerAmountDue')}
                          value={due !== null ? `${fmt(due, locale)} GNF` : '—'}
                        />
                        <CardField
                          label={t('headerPaid')}
                          value={<span className="text-success">{fmt(displayPaid, locale)} GNF</span>}
                        />
                        <CardField
                          label={t('headerRemaining')}
                          value={
                            <span
                              className={
                                displayReste !== null && displayReste > 0
                                  ? 'text-warning font-semibold'
                                  : 'text-foreground font-semibold'
                              }
                            >
                              {displayReste !== null ? `${fmt(displayReste, locale)} GNF` : '—'}
                            </span>
                          }
                        />
                      </>
                    );
                  }}
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
                      {t('headerClass')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerAmountDue')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerPaid')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerRemaining')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerStatus')}
                    </span>
                  </div>

                  {rows.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {t('noStudents')}
                    </div>
                  ) : (
                    <div>
                      {rows.map(({ student, due, paid, reste, statusKey }) => {
                        // Display-only clamp: once a student has paid at
                        // least the full fee-schedule amount, this balance
                        // summary should read "paid = due" / "remaining =
                        // 0" — never a "paid" above the barème or a
                        // negative "remaining" (which would misleadingly
                        // read as the school owing the family money). The
                        // real recorded total (used below in the payment
                        // history, and in every revenue report) is never
                        // altered — only how it's summarized here.
                        const displayPaid = due !== null ? Math.min(paid, due) : paid;
                        const displayReste = reste !== null ? Math.max(0, reste) : null;
                        return (
                          <div
                            key={student.id}
                            className="grid grid-cols-7 gap-3 px-5 py-3 border-b border-border items-center hover:bg-input"
                          >
                            <span className="col-span-2 text-sm font-semibold text-foreground">
                              {student.nom} {student.prenom}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {student.schoolClass.name}
                            </span>
                            <span className="text-sm text-foreground">
                              {due !== null ? `${fmt(due, locale)} GNF` : '—'}
                            </span>
                            <span className="text-sm text-success">
                              {fmt(displayPaid, locale)} GNF
                            </span>
                            <span
                              className={`text-sm font-semibold ${displayReste !== null && displayReste > 0 ? 'text-warning' : 'text-foreground'}`}
                            >
                              {displayReste !== null ? `${fmt(displayReste, locale)} GNF` : '—'}
                            </span>
                            <span
                              className={`text-xs font-semibold w-fit px-2 py-1 rounded-md ${
                                statusKey === 'statusSettled'
                                  ? 'text-success bg-success/10'
                                  : statusKey === 'statusPartial'
                                    ? 'text-warning bg-warning/10'
                                    : statusKey === 'statusUnpaid'
                                      ? 'text-danger bg-danger/10'
                                      : 'text-muted-foreground bg-muted'
                              }`}
                            >
                              {t(statusKey)}
                            </span>
                          </div>
                        );
                      })}
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
                          {p.student ? `${p.student.nom} ${p.student.prenom}` : '—'}
                        </div>
                        {p.student && (
                          <div className="text-xs text-muted-foreground">
                            {p.student.schoolClass.name}
                          </div>
                        )}
                      </div>
                      <CardField
                        label={t('headerDueDate')}
                        value={
                          p.periode && ['T1', 'T2', 'T3', 'ANNUEL'].includes(p.periode)
                            ? t(`periods.${p.periode}`)
                            : (p.periode ?? '—')
                        }
                      />
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
                          editHref={`/accounting/tuition/${p.id}`}
                          deleteUrl={`/api/accounting/tuition/${p.id}`}
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
                      {t('headerDueDate')}
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

                  {recentPayments.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {t('noPayments')}
                    </div>
                  ) : (
                    <div>
                      {recentPayments.map((p) => (
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
                          <span className="text-sm text-muted-foreground">
                            {p.periode && ['T1', 'T2', 'T3', 'ANNUEL'].includes(p.periode)
                              ? t(`periods.${p.periode}`)
                              : (p.periode ?? '—')}
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
                              editHref={`/accounting/tuition/${p.id}`}
                              deleteUrl={`/api/accounting/tuition/${p.id}`}
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

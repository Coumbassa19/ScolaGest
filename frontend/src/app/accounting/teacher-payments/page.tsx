import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import RowActions from '@/components/RowActions';
import TeacherPaymentForm from '@/components/forms/TeacherPaymentForm';
import EditableSalaryCell from '@/components/forms/EditableSalaryCell';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

const WEEKS_PER_MONTH = 4;

export const metadata: Metadata = {
  title: 'Paiement des enseignants',
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

function toMinutes(hhmm: string): number | null {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function hoursBetween(heureDebut: string, heureFin: string): number {
  const start = toMinutes(heureDebut);
  const end = toMinutes(heureFin);
  if (start === null || end === null) return 0;
  return Math.max(0, (end - start) / 60);
}

export default async function TeacherPaymentsAccountingPage() {
  const staff = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('accounting.teacherPayments.list');
  const tc = await getTranslations('accounting.common');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [teachers, recentPayments, yearPayments, scheduleEntries, outstandingAdvances] =
    await Promise.all([
      prisma.teacher.findMany({ orderBy: [{ nom: 'asc' }, { prenom: 'asc' }] }),
      prisma.teacherPayment.findMany({
        include: { teacher: true },
        orderBy: { datePaiement: 'desc' },
        take: 200,
      }),
      prisma.teacherPayment.findMany({
        where: { datePaiement: { gte: startOfYear } },
        select: { teacherId: true, montant: true, periode: true },
      }),
      prisma.scheduleEntry.findMany({
        where: { teacherId: { not: null } },
        select: { teacherId: true, heureDebut: true, heureFin: true },
      }),
      // Salary advances flagged against THIS month's pay (see Avances sur
      // salaire) — subtracted from the auto-filled montant so a teacher who
      // already took a cash advance isn't paid their full salary twice.
      prisma.salaryAdvance.findMany({
        where: { teacherId: { not: null }, statut: 'EN_COURS', periodeAAffecter: currentMonth },
        select: { teacherId: true, montant: true },
      }),
    ]);

  const paidThisYearByTeacher = new Map<string, number>();
  const paidThisMonthByTeacher = new Set<string>();
  for (const p of yearPayments) {
    paidThisYearByTeacher.set(
      p.teacherId,
      (paidThisYearByTeacher.get(p.teacherId) ?? 0) + p.montant,
    );
    if (p.periode === currentMonth) paidThisMonthByTeacher.add(p.teacherId);
  }

  // Weekly hours per teacher from the timetable — teachers here are paid by
  // the hour according to their emploi du temps, not a flat company salary,
  // so this is shown next to the (manually-set) monthly salary as context
  // for deciding what that amount should actually be.
  const weeklyHoursByTeacher = new Map<string, number>();
  for (const e of scheduleEntries) {
    if (!e.teacherId) continue;
    const hours = hoursBetween(e.heureDebut, e.heureFin);
    weeklyHoursByTeacher.set(e.teacherId, (weeklyHoursByTeacher.get(e.teacherId) ?? 0) + hours);
  }

  const outstandingAdvanceByTeacher = new Map<string, number>();
  for (const a of outstandingAdvances) {
    if (!a.teacherId) continue;
    outstandingAdvanceByTeacher.set(
      a.teacherId,
      (outstandingAdvanceByTeacher.get(a.teacherId) ?? 0) + a.montant,
    );
  }

  // Estimated, not contractual — teachers are paid by the hour, so this is
  // heures/semaine × 4 semaines × taux horaire summed across everyone with
  // both values set.
  const totalMasseSalarialeMensuelle = teachers.reduce(
    (sum, t) =>
      sum + (t.tauxHoraire ?? 0) * (weeklyHoursByTeacher.get(t.id) ?? 0) * WEEKS_PER_MONTH,
    0,
  );
  const totalPayeCeMois = recentPayments
    .filter((p) => p.periode === currentMonth)
    .reduce((sum, p) => sum + p.montant, 0);
  const nbEnseignantsPayesCeMois = paidThisMonthByTeacher.size;
  const nbEnseignantsEnAttente = teachers.length - nbEnseignantsPayesCeMois;

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-teacher-payments"
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
            <TeacherPaymentForm
              teachers={teachers.map((teacher) => ({
                id: teacher.id,
                nom: teacher.nom,
                prenom: teacher.prenom,
                tauxHoraire: teacher.tauxHoraire,
                weeklyHours: weeklyHoursByTeacher.get(teacher.id) ?? 0,
                outstandingAdvance: outstandingAdvanceByTeacher.get(teacher.id) ?? 0,
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
                  {nbEnseignantsPayesCeMois}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statTeachersPaid')}</p>
              </div>
              <div className="bg-surface rounded-lg border border-border px-4 py-4">
                <p className="text-2xl font-headings font-semibold text-warning">
                  {nbEnseignantsEnAttente}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('statTeachersPending')}</p>
              </div>
            </div>

            {/* Per-teacher status */}
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
                  items={teachers}
                  keyFor={(teacher) => teacher.id}
                  emptyMessage={t('noTeachers')}
                  renderCard={(teacher) => (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {teacher.nom} {teacher.prenom}
                        </span>
                        <span
                          className={`text-xs font-semibold shrink-0 px-2 py-1 rounded-md ${
                            paidThisMonthByTeacher.has(teacher.id)
                              ? 'text-success bg-success/10'
                              : 'text-warning bg-warning/10'
                          }`}
                        >
                          {paidThisMonthByTeacher.has(teacher.id) ? t('paid') : t('unpaid')}
                        </span>
                      </div>
                      <CardField
                        label={t('headerWeeklyHours')}
                        value={
                          weeklyHoursByTeacher.get(teacher.id)
                            ? `${weeklyHoursByTeacher.get(teacher.id)}h`
                            : '—'
                        }
                      />
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                          {t('headerHourlyRate')}
                        </span>
                        <EditableSalaryCell
                          teacherId={teacher.id}
                          tauxHoraire={teacher.tauxHoraire}
                        />
                      </div>
                      <CardField
                        label={t('headerPaidThisYear')}
                        value={`${fmt(paidThisYearByTeacher.get(teacher.id) ?? 0, locale)} GNF`}
                      />
                      {Boolean(outstandingAdvanceByTeacher.get(teacher.id)) && (
                        <CardField
                          label={t('headerOutstandingAdvance')}
                          value={`${fmt(outstandingAdvanceByTeacher.get(teacher.id) ?? 0, locale)} GNF`}
                        />
                      )}
                    </>
                  )}
                />
              </div>

              {/* Desktop: grid table (sm and up) */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-6 gap-3 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                      {t('headerTeacher')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerWeeklyHours')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerHourlyRate')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerPaidThisYear')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerStatusThisMonth')}
                    </span>
                  </div>
                  {teachers.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {t('noTeachers')}
                    </div>
                  ) : (
                    <div>
                      {teachers.map((teacher) => (
                        <div
                          key={teacher.id}
                          className="grid grid-cols-6 gap-3 px-5 py-3 border-b border-border items-center hover:bg-input"
                        >
                          <span className="col-span-2 text-sm font-semibold text-foreground">
                            {teacher.nom} {teacher.prenom}
                            {Boolean(outstandingAdvanceByTeacher.get(teacher.id)) && (
                              <span className="block text-xs font-normal text-warning">
                                {t('headerOutstandingAdvance')}:{' '}
                                {fmt(outstandingAdvanceByTeacher.get(teacher.id) ?? 0, locale)} GNF
                              </span>
                            )}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {weeklyHoursByTeacher.get(teacher.id)
                              ? `${weeklyHoursByTeacher.get(teacher.id)}h`
                              : '—'}
                          </span>
                          <EditableSalaryCell
                            teacherId={teacher.id}
                            tauxHoraire={teacher.tauxHoraire}
                          />
                          <span className="text-sm text-foreground">
                            {fmt(paidThisYearByTeacher.get(teacher.id) ?? 0, locale)} GNF
                          </span>
                          <span
                            className={`text-xs font-semibold w-fit px-2 py-1 rounded-md ${
                              paidThisMonthByTeacher.has(teacher.id)
                                ? 'text-success bg-success/10'
                                : 'text-warning bg-warning/10'
                            }`}
                          >
                            {paidThisMonthByTeacher.has(teacher.id) ? t('paid') : t('unpaid')}
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
                          {p.teacher.nom} {p.teacher.prenom}
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
                          editHref={`/accounting/teacher-payments/${p.id}`}
                          deleteUrl={`/api/accounting/teacher-payments/${p.id}`}
                          confirmMessage={t('deleteConfirm', {
                            name: `${p.teacher.nom} ${p.teacher.prenom}`,
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
                      {t('headerTeacher')}
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
                            {p.teacher.nom} {p.teacher.prenom}
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
                            editHref={`/accounting/teacher-payments/${p.id}`}
                            deleteUrl={`/api/accounting/teacher-payments/${p.id}`}
                            confirmMessage={t('deleteConfirm', {
                              name: `${p.teacher.nom} ${p.teacher.prenom}`,
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

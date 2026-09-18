import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import StatCard from '@/components/StatCard';
import PendingPayments, { type OutstandingBalanceEntry } from '@/components/PendingPayments';
import RevenueChart, { type MonthDatum } from '@/components/RevenueChart';
import RecentActivity, { type ActivityEntry } from '@/components/RecentActivity';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Tableau de bord',
};

const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

function relativeTime(
  d: Date,
  now: Date,
  t: Awaited<ReturnType<typeof getTranslations<'dashboard'>>>,
): string {
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return t('justNow');
  if (diffH < 24) return t('hoursAgo', { h: diffH });
  const diffDays = Math.floor(diffH / 24);
  if (diffDays === 1) return t('yesterday');
  return t('daysAgo', { d: diffDays });
}

export default async function DashboardPage() {
  // 'dashboard' is the one menu every staff account always has (see
  // TEACHER_CORE_MENUS / DIRECTION_CORE_MENUS in menu-keys.ts) — this is
  // still the actual security boundary though: this page was the one
  // school-domain route the RBAC rollout missed, and it queries revenue
  // and enrollment totals straight from Prisma with no other gate.
  const staff = await requirePageAuth({ menuKey: 'dashboard' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('dashboard');
  const locale = await getLocale();
  const numberLocale = locale === 'en' ? 'en-GB' : 'fr-FR';
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    totalStudents,
    monthPayments,
    prevMonthPayments,
    chartPayments,
    coursCount,
    recentPayments,
    currentYear,
    classes,
    students,
    paidAgg,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.revenuePayment.findMany({
      where: { date: { gte: startOfMonth } },
      select: { montant: true },
    }),
    prisma.revenuePayment.findMany({
      where: { date: { gte: prevMonthStart, lt: startOfMonth } },
      select: { montant: true },
    }),
    prisma.revenuePayment.findMany({
      where: { date: { gte: sixMonthsAgo } },
      select: { montant: true, date: true },
    }),
    prisma.scheduleEntry.count(),
    prisma.revenuePayment.findMany({
      include: { student: true },
      orderBy: { date: 'desc' },
      take: 4,
    }),
    prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { label: true } }),
    prisma.schoolClass.findMany({ include: { tuitionPlans: true } }),
    prisma.student.findMany({ include: { schoolClass: true } }),
    prisma.revenuePayment.groupBy({
      by: ['studentId'],
      where: { categorie: 'SCOLARITE', studentId: { not: null } },
      _sum: { montant: true },
    }),
  ]);

  const revenusCeMois = monthPayments.reduce((sum, p) => sum + p.montant, 0);
  const revenusMoisDernier = prevMonthPayments.reduce((sum, p) => sum + p.montant, 0);
  const trendPct =
    revenusMoisDernier > 0
      ? Math.round(((revenusCeMois - revenusMoisDernier) / revenusMoisDernier) * 100)
      : null;

  // Bucket the last 6 months of payments by calendar month for the chart.
  // Each bar's height is relative to the highest month in the window (not a
  // fixed target), so the chart still reads sensibly however much the
  // school actually collects.
  const monthTotals: { label: string; value: number; current: boolean }[] = [];
  for (let i = 5; i >= 0; i--) {
    const bucketStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const bucketEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const total = chartPayments
      .filter((p) => p.date >= bucketStart && p.date < bucketEnd)
      .reduce((sum, p) => sum + p.montant, 0);
    monthTotals.push({
      label: t(`months.${MONTH_KEYS[bucketStart.getMonth()]}`),
      value: total,
      current: i === 0,
    });
  }
  const maxMonthValue = Math.max(1, ...monthTotals.map((m) => m.value));
  const months: MonthDatum[] = monthTotals.map((m) => ({ ...m, max: maxMonthValue }));

  const recentActivity: ActivityEntry[] = recentPayments.map((p) => ({
    label: t('paymentReceived', { name: p.student ? `${p.student.nom} ${p.student.prenom}` : p.source }),
    amount: `+${p.montant.toLocaleString(numberLocale)} GNF`,
    time: relativeTime(p.date, now, t),
    icon: 'circle-dollar-sign',
    positive: true,
  }));

  // Real outstanding tuition balances (same TuitionPlan/RevenuePayment
  // calculation as /accounting/tuition) — replaces the old fake
  // PendingPayments mockup with genuine per-student data.
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
  const outstanding = students
    .map((s) => {
      const due = dueByClass.get(s.classId) ?? null;
      const paid = paidByStudent.get(s.id) ?? 0;
      const reste = due !== null ? due - paid : null;
      return { student: s, reste };
    })
    .filter((r): r is { student: (typeof students)[number]; reste: number } => (r.reste ?? 0) > 0)
    .sort((a, b) => b.reste - a.reste);

  const outstandingCount = outstanding.length;
  const totalOutstanding = outstanding.reduce((sum, r) => sum + r.reste, 0);
  const outstandingEntries: OutstandingBalanceEntry[] = outstanding.slice(0, 5).map((r) => ({
    id: r.student.id,
    name: `${r.student.nom} ${r.student.prenom}`,
    amount: `${r.reste.toLocaleString(numberLocale)} GNF`,
    className: r.student.schoolClass.name,
    sexe: r.student.sexe,
    photoUrl: r.student.photoUrl,
  }));

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      {/* Sidebar */}
      <Sidebar activeItem="dashboard" />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={t('title')} subtitle={t('subtitle')} />

        <div className="flex-1 px-4 py-4 md:px-8 md:py-6 space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t('revenueThisMonth')}
              value={`${revenusCeMois.toLocaleString(numberLocale)} GNF`}
              trend={
                trendPct !== null
                  ? t('vsLastMonth', { pct: `${trendPct >= 0 ? '+' : ''}${trendPct}` })
                  : t('noDataLastMonth')
              }
              trendUp={trendPct === null || trendPct >= 0}
              icon="circle-dollar-sign"
              iconColor="text-accent"
              iconBg="bg-secondary"
            />
            <StatCard
              label={t('activeStudents')}
              value={String(totalStudents)}
              trend={t('enrolledThisYear')}
              trendUp={true}
              icon="users"
              iconColor="text-primary"
              iconBg="bg-secondary"
            />
            <StatCard
              label={t('scheduledSlots')}
              value={String(coursCount)}
              trend={t('timetable')}
              trendUp={true}
              icon="book-open"
              iconColor="text-success"
              iconBg="bg-success-bg"
            />
            <StatCard
              label={t('pendingPayments')}
              value={`${totalOutstanding.toLocaleString(numberLocale)} GNF`}
              trend={
                outstandingCount > 0
                  ? t('studentsConcerned', { count: outstandingCount })
                  : t('noOutstandingBalance')
              }
              trendUp={outstandingCount === 0}
              icon="clock"
              iconColor="text-warning"
              iconBg="bg-warning-bg"
            />
          </div>

          {/* Middle row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <RevenueChart months={months} />
            </div>
            <PendingPayments entries={outstandingEntries} />
          </div>

          {/* Bottom row */}
          <RecentActivity entries={recentActivity} />
        </div>
      </div>
    </div>
  );
}

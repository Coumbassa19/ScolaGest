import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import StatCard from '@/components/StatCard';
import Icon from '@/components/global/Icon';
import { requireAdminPage } from '@/lib/server/middleware/require-page-auth';
import { formatPrice } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Plateforme',
};

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

export default async function PlatformSchoolsPage() {
  // Role gate, not a menu gate — this is platform-owner (SUPERADMIN) data
  // across every school, never something a school's own DIRECTION/ADMIN
  // account should reach. See requireAdminPage / the school-signup route's
  // header comment for why ADMIN specifically must stay platform-only.
  const admin = await requireAdminPage('SUPERADMIN');
  const prisma = admin.user.prisma;

  const t = await getTranslations('platform');
  const locale = await getLocale();

  const schools = await prisma.school.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      plan: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
  });

  const totalSchools = schools.length;
  const trialingCount = schools.filter((s) => s.status === 'TRIALING').length;
  const activeCount = schools.filter((s) => s.status === 'ACTIVE').length;
  const pastDueCount = schools.filter((s) => s.status === 'PAST_DUE').length;

  const revenueAgg = await prisma.schoolSubscriptionPayment.aggregate({
    where: { status: 'PAID' },
    _sum: { amount: true },
  });
  const totalRevenue = revenueAgg._sum.amount ?? 0;

  function fmtDate(d: Date): string {
    return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="platform" />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={t('title')} subtitle={t('subtitle')} />

        <div className="flex-1 px-4 py-4 md:px-8 md:py-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              label={t('kpiTotalSchools')}
              value={String(totalSchools)}
              trend=""
              trendUp
              icon="building-2"
              iconColor="text-primary"
              iconBg="bg-secondary"
            />
            <StatCard
              label={t('kpiTrialing')}
              value={String(trialingCount)}
              trend=""
              trendUp
              icon="clock"
              iconColor="text-warning"
              iconBg="bg-warning-bg"
            />
            <StatCard
              label={t('kpiActive')}
              value={String(activeCount)}
              trend=""
              trendUp
              icon="circle-check"
              iconColor="text-success"
              iconBg="bg-success-bg"
            />
            <StatCard
              label={t('kpiPastDue')}
              value={String(pastDueCount)}
              trend=""
              trendUp={pastDueCount === 0}
              icon="circle-alert"
              iconColor="text-danger"
              iconBg="bg-danger-bg"
            />
            <StatCard
              label={t('kpiRevenue')}
              value={formatPrice(totalRevenue, 'GNF')}
              trend=""
              trendUp
              icon="circle-dollar-sign"
              iconColor="text-accent"
              iconBg="bg-secondary"
            />
          </div>

          {totalRevenue === 0 && (
            <div className="bg-surface border border-border rounded-lg px-4 py-3 flex items-start gap-3">
              <Icon i="info" size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{t('revenueNote')}</p>
            </div>
          )}

          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted">
              <h2 className="text-sm font-headings font-semibold text-foreground">
                {t('tableTitle')}
              </h2>
            </div>
            {schools.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                {t('noSchools')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[820px]">
                  <div className="grid grid-cols-6 gap-4 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerSchool')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerStatus')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerPlan')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerUsers')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerSignupDate')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerPeriodEnd')}
                    </span>
                  </div>
                  <div>
                    {schools.map((school) => {
                      const style = STATUS_STYLES[school.status] ?? STATUS_STYLES.TRIALING!;
                      const labelKey = STATUS_LABEL_KEY[school.status] ?? 'statusTrialing';
                      const planLabelKey = school.plan === 'ESSENTIEL' ? 'planEssentiel' : 'planCroissance';
                      const periodEnd =
                        school.status === 'TRIALING' ? school.trialEndsAt : school.currentPeriodEnd;
                      return (
                        <div
                          key={school.id}
                          className="grid grid-cols-6 gap-4 px-5 py-3 border-b border-border last:border-b-0 items-center"
                        >
                          <span className="text-sm font-semibold text-foreground">{school.name}</span>
                          <span>
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
                            >
                              {t(labelKey as never)}
                            </span>
                          </span>
                          <span className="text-sm text-muted-foreground">{t(planLabelKey as never)}</span>
                          <span className="text-sm text-muted-foreground">
                            {t('usersCount', { count: school._count.users })}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {fmtDate(school.createdAt)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {periodEnd ? fmtDate(periodEnd) : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import EffectifFilters, { type EffectifView } from '@/components/EffectifFilters';
import Icon from '@/components/global/Icon';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Total effectif',
};

export default async function TotalEffectifPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; vue?: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'students' });
  const prisma = staff.user.prisma;
  const t = await getTranslations('totalEffectif');
  const tStudents = await getTranslations('students.list');
  const { classId, vue } = await searchParams;
  const activeView: EffectifView = vue === 'sexe' || vue === 'moyenne' ? vue : 'tous';

  const allClasses = await prisma.schoolClass.findMany({
    orderBy: [{ level: 'desc' }, { name: 'asc' }],
    include: { students: { select: { sexe: true } } },
  });

  const allClassEffectif = allClasses.map((c) => {
    const garcons = c.students.filter((s) => s.sexe === 'M').length;
    const filles = c.students.filter((s) => s.sexe === 'F').length;
    return { id: c.id, classe: c.name, total: c.students.length, garcons, filles };
  });

  // "Moyenne par classe" is a whole-school reference figure — always
  // computed across every class, even while the table is filtered down to
  // one, so a filtered class can be compared against it.
  const totalElevesEcole = allClassEffectif.reduce((sum, c) => sum + c.total, 0);
  const moyenneGenerale =
    allClassEffectif.length > 0 ? totalElevesEcole / allClassEffectif.length : 0;

  const classEffectif = classId
    ? allClassEffectif.filter((c) => c.id === classId)
    : allClassEffectif;

  const totalEleves = classEffectif.reduce((sum, c) => sum + c.total, 0);
  const totalGarcons = classEffectif.reduce((sum, c) => sum + c.garcons, 0);
  const totalFilles = classEffectif.reduce((sum, c) => sum + c.filles, 0);
  const pctGarcons = totalEleves > 0 ? Math.round((totalGarcons / totalEleves) * 100) : 0;
  const pctFilles = totalEleves > 0 ? Math.round((totalFilles / totalEleves) * 100) : 0;

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      {/* Sidebar */}
      <Sidebar
        activeItem="students"
        activeSubmenu="students-total-effectif"
        expandedMenu="students"
      />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/students"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {tStudents('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title')}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6 space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t('statTotalStudents')}
              value={String(totalEleves)}
              trend={classId ? t('trendSelectedClass') : t('trendAllLevels')}
              trendUp={true}
              icon="users"
              iconColor="text-primary"
              iconBg="bg-secondary"
            />
            <StatCard
              label={t('statBoys')}
              value={String(totalGarcons)}
              trend={t('trendPctOfTotal', { pct: pctGarcons })}
              trendUp={true}
              icon="user"
              iconColor="text-primary"
              iconBg="bg-secondary"
            />
            <StatCard
              label={t('statGirls')}
              value={String(totalFilles)}
              trend={t('trendPctOfTotal', { pct: pctFilles })}
              trendUp={true}
              icon="user"
              iconColor="text-accent"
              iconBg="bg-secondary"
            />
            <StatCard
              label={t('statAveragePerClass')}
              value={moyenneGenerale.toFixed(1)}
              trend={t('trendAllClassesCombined')}
              trendUp={true}
              icon="grid-3x3"
              iconColor="text-success"
              iconBg="bg-success-bg"
            />
          </div>

          {/* View tabs + class filter */}
          <EffectifFilters
            classes={allClasses.map((c) => ({ id: c.id, name: c.name }))}
            activeView={activeView}
            activeClassId={classId ?? ''}
          />

          {/* Classes Table */}
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {/* Mobile: stacked cards (below sm) */}
            {classEffectif.length > 0 && (
              <div className="sm:hidden">
                {activeView === 'sexe' ? (
                  <MobileCardList
                    items={classEffectif}
                    keyFor={(item) => item.id}
                    emptyMessage={t('noClasses')}
                    renderCard={(item) => {
                      const pctG = item.total > 0 ? Math.round((item.garcons / item.total) * 100) : 0;
                      const pctF = item.total > 0 ? Math.round((item.filles / item.total) * 100) : 0;
                      return (
                        <>
                          <div className="font-semibold text-foreground text-sm">{item.classe}</div>
                          <CardField
                            label={t('headerBoys')}
                            value={
                              <span>
                                {item.garcons}{' '}
                                <span className="text-primary text-xs">({pctG}%)</span>
                              </span>
                            }
                          />
                          <CardField
                            label={t('headerGirls')}
                            value={
                              <span>
                                {item.filles}{' '}
                                <span className="text-accent text-xs">({pctF}%)</span>
                              </span>
                            }
                          />
                        </>
                      );
                    }}
                  />
                ) : activeView === 'moyenne' ? (
                  <MobileCardList
                    items={classEffectif}
                    keyFor={(item) => item.id}
                    emptyMessage={t('noClasses')}
                    renderCard={(item) => {
                      const ecart = Math.round((item.total - moyenneGenerale) * 10) / 10;
                      return (
                        <>
                          <div className="font-semibold text-foreground text-sm">{item.classe}</div>
                          <CardField
                            label={t('headerEnrolment')}
                            value={<span className="text-primary font-semibold">{item.total}</span>}
                          />
                          <CardField
                            label={t('headerDeviation', { avg: moyenneGenerale.toFixed(1) })}
                            value={
                              <span
                                className={
                                  ecart > 0
                                    ? 'text-success font-semibold'
                                    : ecart < 0
                                      ? 'text-danger font-semibold'
                                      : 'text-muted-foreground font-semibold'
                                }
                              >
                                {ecart > 0 ? '+' : ''}
                                {ecart}
                              </span>
                            }
                          />
                        </>
                      );
                    }}
                  />
                ) : (
                  <MobileCardList
                    items={classEffectif}
                    keyFor={(item) => item.id}
                    emptyMessage={t('noClasses')}
                    renderCard={(item) => {
                      const ratio = item.total > 0 ? ((item.garcons / item.total) * 100).toFixed(0) : '0';
                      return (
                        <>
                          <div className="font-semibold text-foreground text-sm">{item.classe}</div>
                          <CardField
                            label={t('headerTotalStudents')}
                            value={<span className="text-primary font-semibold">{item.total}</span>}
                          />
                          <CardField label={t('headerBoys')} value={item.garcons} />
                          <CardField label={t('headerGirls')} value={item.filles} />
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                              {t('headerRatio')}
                            </span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${ratio}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-8 text-right">
                              {ratio}%
                            </span>
                          </div>
                        </>
                      );
                    }}
                  />
                )}
              </div>
            )}

            {/* Desktop: grid table (sm and up) */}
            <div className="hidden sm:block overflow-x-auto">
              <div className="min-w-[640px]">
                {classEffectif.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                    {t('noClasses')}
                  </div>
                ) : activeView === 'sexe' ? (
                  <>
                    <div className="grid grid-cols-5 gap-4 px-5 py-3 bg-muted border-b border-border">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerClass')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerBoys')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerPctBoys')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerGirls')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerPctGirls')}
                      </span>
                    </div>
                    <div>
                      {classEffectif.map((item) => {
                        const pctG =
                          item.total > 0 ? Math.round((item.garcons / item.total) * 100) : 0;
                        const pctF =
                          item.total > 0 ? Math.round((item.filles / item.total) * 100) : 0;
                        return (
                          <div
                            key={item.id}
                            className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-border hover:bg-input items-center"
                          >
                            <span className="text-sm font-semibold text-foreground">
                              {item.classe}
                            </span>
                            <span className="text-sm text-foreground">{item.garcons}</span>
                            <span className="text-sm text-primary">{pctG}%</span>
                            <span className="text-sm text-foreground">{item.filles}</span>
                            <span className="text-sm text-accent">{pctF}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : activeView === 'moyenne' ? (
                  <>
                    <div className="grid grid-cols-3 gap-4 px-5 py-3 bg-muted border-b border-border">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerClass')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerEnrolment')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerDeviation', { avg: moyenneGenerale.toFixed(1) })}
                      </span>
                    </div>
                    <div>
                      {classEffectif.map((item) => {
                        const ecart = Math.round((item.total - moyenneGenerale) * 10) / 10;
                        return (
                          <div
                            key={item.id}
                            className="grid grid-cols-3 gap-4 px-5 py-3 border-b border-border hover:bg-input items-center"
                          >
                            <span className="text-sm font-semibold text-foreground">
                              {item.classe}
                            </span>
                            <span className="text-sm font-semibold text-primary">{item.total}</span>
                            <span
                              className={`text-sm font-semibold ${
                                ecart > 0
                                  ? 'text-success'
                                  : ecart < 0
                                    ? 'text-danger'
                                    : 'text-muted-foreground'
                              }`}
                            >
                              {ecart > 0 ? '+' : ''}
                              {ecart}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-4 px-5 py-3 bg-muted border-b border-border">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerClass')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerTotalStudents')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerBoys')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerGirls')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerRatio')}
                      </span>
                    </div>
                    <div>
                      {classEffectif.map((item) => {
                        const ratio =
                          item.total > 0 ? ((item.garcons / item.total) * 100).toFixed(0) : '0';
                        return (
                          <div
                            key={item.id}
                            className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-border hover:bg-input items-center"
                          >
                            <span className="text-sm font-semibold text-foreground">
                              {item.classe}
                            </span>
                            <span className="text-sm font-semibold text-primary">{item.total}</span>
                            <span className="text-sm text-foreground">{item.garcons}</span>
                            <span className="text-sm text-foreground">{item.filles}</span>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${ratio}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-8 text-right">
                                {ratio}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

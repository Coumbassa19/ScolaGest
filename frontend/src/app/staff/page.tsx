import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import StatCard from '@/components/StatCard';
import RowActions from '@/components/RowActions';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Personnel',
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Dedicated "register a staff member" home — its own top-level nav item
  // (Sidebar.tsx, right after Absences), not nested under Comptabilité,
  // which reads as a payment tool rather than a registration one. Gated to
  // its own 'staff' menu key, same as /add-staff, /staff/[id] and the
  // underlying /api/staff routes.
  const staff = await requirePageAuth({ menuKey: 'staff' });
  const prisma = staff.user.prisma;

  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const t = await getTranslations('staff.list');

  const allStaff = await prisma.staff.findMany({
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const staffMembers = query
    ? allStaff.filter((s) => {
        const haystack = [s.nom, s.prenom, s.poste, s.email, s.telephone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query.toLowerCase());
      })
    : allStaff;

  const totalStaff = allStaff.length;
  const monthlyPayroll = allStaff.reduce((sum, s) => sum + s.salaireMensuel, 0);

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="staff" />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={t('title')}
          subtitle={t('subtitle')}
          searchBasePath="/staff"
          searchQuery={query}
        />

        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="space-y-6 max-w-5xl">
            {/* KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                label={t('totalStaff')}
                value={String(totalStaff)}
                trend={t('totalStaffTrend')}
                trendUp={true}
                icon="users"
                iconColor="text-primary"
                iconBg="bg-secondary"
              />
              <StatCard
                label={t('monthlyPayroll')}
                value={`${fmt(monthlyPayroll)} GNF`}
                trend={t('monthlyPayrollTrend')}
                trendUp={true}
                icon="wallet"
                iconColor="text-accent"
                iconBg="bg-secondary"
              />
            </div>

            {/* Staff Table */}
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-5 py-3 bg-muted border-b border-border flex justify-between items-center">
                <h2 className="text-sm font-semibold text-foreground">{t('listTitle')}</h2>
                <Link
                  href="/add-staff"
                  className="px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-md"
                >
                  {t('addStaff')}
                </Link>
              </div>

              {/* Mobile: stacked cards (below sm) */}
              <div className="sm:hidden">
                <MobileCardList
                  items={staffMembers}
                  keyFor={(s) => s.id}
                  emptyMessage={query ? t('noMatch', { query }) : t('noneYet')}
                  renderCard={(s) => (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {s.nom} {s.prenom}
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground shrink-0">
                          {fmt(s.salaireMensuel)} GNF
                        </span>
                      </div>
                      <CardField label={t('headerPoste')} value={s.poste} />
                      <CardField label={t('headerContact')} value={s.telephone || s.email || '—'} />
                      <div className="pt-1.5 flex justify-end">
                        <RowActions
                          editHref={`/staff/${s.id}`}
                          deleteUrl={`/api/staff/${s.id}`}
                          confirmMessage={t('confirmDelete', { name: `${s.nom} ${s.prenom}` })}
                        />
                      </div>
                    </>
                  )}
                />
              </div>

              {/* Desktop: grid table (sm and up) */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid grid-cols-5 gap-4 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerName')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerPoste')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerContact')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerSalary')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                      {t('headerActions')}
                    </span>
                  </div>

                  {staffMembers.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {query ? t('noMatch', { query }) : t('noneYet')}
                    </div>
                  ) : (
                    <div>
                      {staffMembers.map((s) => (
                        <div
                          key={s.id}
                          className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-border hover:bg-input items-center text-sm"
                        >
                          <span className="font-semibold text-foreground">
                            {s.nom} {s.prenom}
                          </span>
                          <span className="text-foreground">{s.poste}</span>
                          <span className="text-muted-foreground">
                            {s.telephone || s.email || '—'}
                          </span>
                          <span className="text-foreground">{fmt(s.salaireMensuel)} GNF</span>
                          <RowActions
                            editHref={`/staff/${s.id}`}
                            deleteUrl={`/api/staff/${s.id}`}
                            confirmMessage={t('confirmDelete', { name: `${s.nom} ${s.prenom}` })}
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

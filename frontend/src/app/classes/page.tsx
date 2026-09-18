import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import RowActions from '@/components/RowActions';
import AddClassForm from '@/components/forms/AddClassForm';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Classes',
};

export default async function ClassesPage() {
  const staff = await requirePageAuth({ menuKey: 'students' });
  const prisma = staff.user.prisma;
  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ level: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { students: true } } },
  });
  const t = await getTranslations('classes.list');

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      {/* Sidebar */}
      <Sidebar
        activeItem="students"
        activeSubmenu="students-classes"
        expandedMenu="students"
      />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
              {t('title')}
            </h1>
            <AddClassForm />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {/* Mobile: stacked cards (below sm) */}
            <div className="sm:hidden">
              <MobileCardList
                items={classes}
                keyFor={(c) => c.id}
                emptyMessage={t('noClasses')}
                renderCard={(c) => (
                  <>
                    <div className="font-semibold text-foreground text-sm">{c.name}</div>
                    <CardField label={t('headerLevel')} value={c.level} />
                    <CardField label={t('headerEnrolled')} value={c._count.students} />
                    <div className="pt-1.5 flex justify-end">
                      <RowActions
                        editHref={`/classes/${c.id}`}
                        deleteUrl={`/api/classes/${c.id}`}
                        confirmMessage={t('confirmDelete', { name: c.name })}
                      />
                    </div>
                  </>
                )}
              />
            </div>

            {/* Desktop: grid table (sm and up) */}
            <div className="hidden sm:block overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-4 gap-4 px-5 py-3 bg-muted border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerClass')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerLevel')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerEnrolled')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                    {t('headerActions')}
                  </span>
                </div>

                {classes.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                    {t('noClasses')}
                  </div>
                ) : (
                  <div>
                    {classes.map((c) => (
                      <div
                        key={c.id}
                        className="grid grid-cols-4 gap-4 px-5 py-3 border-b border-border items-center hover:bg-input"
                      >
                        <span className="text-sm font-semibold text-foreground">{c.name}</span>
                        <span className="text-sm text-muted-foreground">{c.level}</span>
                        <span className="text-sm text-foreground">{c._count.students}</span>
                        <RowActions
                          editHref={`/classes/${c.id}`}
                          deleteUrl={`/api/classes/${c.id}`}
                          confirmMessage={t('confirmDelete', { name: c.name })}
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
  );
}

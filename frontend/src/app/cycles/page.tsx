import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import RowActions from '@/components/RowActions';
import AddCycleForm from '@/components/forms/AddCycleForm';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Cycles',
};

export default async function CyclesPage() {
  const staff = await requirePageAuth({ menuKey: 'students' });
  const prisma = staff.user.prisma;
  const cycles = await prisma.cycle.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { classes: true } } },
  });
  const t = await getTranslations('cycles.list');

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      {/* Sidebar */}
      <Sidebar activeItem="students" activeSubmenu="students-cycles" expandedMenu="students" />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/classes"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
                {t('title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
            </div>
            <AddCycleForm />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {/* Mobile: stacked cards (below sm) */}
            <div className="sm:hidden">
              <MobileCardList
                items={cycles}
                keyFor={(c) => c.id}
                emptyMessage={t('noCycles')}
                renderCard={(c) => (
                  <>
                    <div className="font-semibold text-foreground text-sm">{c.name}</div>
                    <CardField label={t('headerNoteMax')} value={`/${c.noteMax}`} />
                    <CardField label={t('headerClasses')} value={c._count.classes} />
                    <div className="pt-1.5 flex justify-end">
                      <RowActions
                        editHref={`/cycles/${c.id}`}
                        deleteUrl={`/api/cycles/${c.id}`}
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
                    {t('headerName')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerNoteMax')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerClasses')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                    {t('headerActions')}
                  </span>
                </div>

                {cycles.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                    {t('noCycles')}
                  </div>
                ) : (
                  <div>
                    {cycles.map((c) => (
                      <div
                        key={c.id}
                        className="grid grid-cols-4 gap-4 px-5 py-3 border-b border-border items-center hover:bg-input"
                      >
                        <span className="text-sm font-semibold text-foreground">{c.name}</span>
                        <span className="text-sm text-muted-foreground">/{c.noteMax}</span>
                        <span className="text-sm text-foreground">{c._count.classes}</span>
                        <RowActions
                          editHref={`/cycles/${c.id}`}
                          deleteUrl={`/api/cycles/${c.id}`}
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

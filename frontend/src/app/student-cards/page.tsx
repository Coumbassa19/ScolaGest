import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import QueryFilterSelect from '@/components/QueryFilterSelect';
import { getClassCardData } from '@/lib/server/student-card';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { requireSchoolId } from '@/lib/server/tenant/context';

export const metadata: Metadata = {
  title: 'Cartes scolaires',
};

export default async function StudentCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'students' });
  const prisma = staff.user.prisma;
  const schoolId = requireSchoolId(staff.user.schoolId);
  const t = await getTranslations('studentCards.list');
  const tCommon = await getTranslations('common');
  const sp = await searchParams;
  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ level: 'desc' }, { name: 'asc' }],
  });
  const classId = sp.classId || classes[0]?.id;

  const students = classId ? await getClassCardData(prisma, schoolId, classId) : [];

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="students"
        activeSubmenu="students-cards"
        expandedMenu="students"
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
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
                {t('title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 md:px-8 border-b border-border bg-secondary flex flex-wrap items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{t('classLabel')}</span>
            <QueryFilterSelect
              param="classId"
              basePath="/student-cards"
              currentQuery={{ classId }}
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          {!classId ? (
            <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {t('noClasses')}
            </div>
          ) : students.length === 0 ? (
            <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {t('noStudentsInClass')}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <a
                  href={`/api/student-cards/pdf?classId=${classId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface hover:bg-input"
                >
                  <Icon i="download" size={16} />
                  {t('downloadAll')}
                </a>
              </div>

              <div className="bg-surface rounded-lg border border-border overflow-hidden">
                {/* Mobile: stacked cards (below sm) */}
                <div className="sm:hidden">
                  <MobileCardList
                    items={students}
                    keyFor={(s) => s.studentId}
                    emptyMessage={t('noStudentsInClass')}
                    renderCard={(s) => (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                            {s.photoUrl ? (
                              // data: URL — next/image can't optimize it, a plain <img> is correct here.
                              <img src={s.photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Icon i="user" size={18} className="text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-sm font-semibold text-foreground">
                            {s.nom} {s.prenom}
                          </span>
                        </div>
                        <CardField label={t('headerMatricule')} value={s.matricule} />
                        <CardField
                          label={t('headerParentContact')}
                          value={s.parentTelephone || '—'}
                        />
                        <div className="pt-1.5 flex justify-end">
                          <Link
                            href={`/student-card?studentId=${s.studentId}`}
                            className="text-sm font-semibold text-primary"
                          >
                            {t('viewCard')}
                          </Link>
                        </div>
                      </>
                    )}
                  />
                </div>

                {/* Desktop: grid table (sm and up) */}
                <div className="hidden sm:block overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-5 gap-4 px-5 py-3 bg-muted border-b border-border">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                        {t('headerStudent')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerMatricule')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerParentContact')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                        {t('headerCard')}
                      </span>
                    </div>
                    <div>
                      {students.map((s) => (
                        <div
                          key={s.studentId}
                          className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-border hover:bg-input items-center"
                        >
                          <div className="flex items-center gap-3 col-span-2">
                            <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                              {s.photoUrl ? (
                                // data: URL — next/image can't optimize it, a plain <img> is correct here.
                                <img
                                  src={s.photoUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Icon i="user" size={18} className="text-muted-foreground" />
                              )}
                            </div>
                            <span className="text-sm font-semibold text-foreground">
                              {s.nom} {s.prenom}
                            </span>
                          </div>
                          <span className="text-sm text-foreground">{s.matricule}</span>
                          <span className="text-sm text-muted-foreground">
                            {s.parentTelephone || '—'}
                          </span>
                          <div className="flex justify-center">
                            <Link
                              href={`/student-card?studentId=${s.studentId}`}
                              className="text-sm font-semibold text-primary"
                            >
                              {t('viewCard')}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

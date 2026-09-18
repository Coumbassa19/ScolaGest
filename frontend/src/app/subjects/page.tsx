import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import RowActions from '@/components/RowActions';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Matières',
};

export default async function SubjectsPage() {
  const staff = await requirePageAuth({ menuKey: 'subjects' });
  const prisma = staff.user.prisma;
  const isTeacher = staff.user.role === 'TEACHER';

  const subjects = await prisma.subject.findMany({
    where: isTeacher
      ? { teacherAssignments: { some: { teacherId: staff.user.teacherId ?? '' } } }
      : {},
    include: { teacher: true },
    orderBy: { nom: 'asc' },
  });

  const totalCoeff = subjects.reduce((sum, s) => sum + s.coefficient, 0);
  const totalVolume = subjects.reduce((sum, s) => sum + s.volumeHoraire, 0);
  const t = await getTranslations('subjects.list');

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="subjects" />

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
            <div>
              <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
                {t('title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
            </div>
            {!isTeacher && (
              <Link
                href="/add-subject"
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md"
              >
                {t('addSubject')}
              </Link>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 py-4 md:px-8 md:py-4 border-b border-border">
          <div className="flex flex-wrap gap-4 md:gap-8">
            <div>
              <span className="text-2xl font-headings font-semibold text-foreground">
                {subjects.length}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">{t('totalSubjects')}</p>
            </div>
            <div className="w-px bg-border"></div>
            <div>
              <span className="text-2xl font-headings font-semibold text-foreground">
                {totalCoeff}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">{t('totalCoefficient')}</p>
            </div>
            <div className="w-px bg-border"></div>
            <div>
              <span className="text-2xl font-headings font-semibold text-foreground">
                {totalVolume}h
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">{t('weeklyVolume')}</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {/* Mobile: stacked cards (below sm) */}
            <div className="sm:hidden">
              <MobileCardList
                items={subjects}
                keyFor={(s) => s.id}
                emptyMessage={t('noneYet')}
                renderCard={(s) => (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-secondary rounded-md flex items-center justify-center flex-shrink-0">
                        <Icon i="book-open" size={12} />
                      </div>
                      <span className="font-semibold text-foreground text-sm">{s.nom}</span>
                      <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        {s.code}
                      </span>
                    </div>
                    <CardField label={t('headerCoefficient')} value={s.coefficient} />
                    <CardField
                      label={t('headerTeacher')}
                      value={s.teacher ? `${s.teacher.nom} ${s.teacher.prenom}` : '—'}
                    />
                    <CardField label={t('headerClasses')} value={s.classesText || '—'} />
                    <CardField
                      label={t('headerVolume')}
                      value={t('hoursPerWeek', { hours: s.volumeHoraire })}
                    />
                    {!isTeacher && (
                      <div className="pt-1.5 flex justify-end">
                        <RowActions
                          editHref={`/subjects/${s.id}`}
                          deleteUrl={`/api/subjects/${s.id}`}
                          confirmMessage={t('confirmDelete', { name: s.nom })}
                        />
                      </div>
                    )}
                  </>
                )}
              />
            </div>

            {/* Desktop: grid table (sm and up) */}
            <div className="hidden sm:block overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header */}
                <div className="grid grid-cols-8 gap-3 px-5 py-3 bg-muted border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                    {t('headerSubject')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerCode')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerCoefficient')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerTeacher')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerClasses')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('headerVolume')}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                    {t('headerActions')}
                  </span>
                </div>

                {/* Rows */}
                {subjects.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                    {t('noneYet')}
                  </div>
                ) : (
                  <div>
                    {subjects.map((s) => (
                      <div
                        key={s.id}
                        className="grid grid-cols-8 gap-3 px-5 py-3 border-b border-border items-center hover:bg-input"
                      >
                        <div className="col-span-2 flex items-center gap-3">
                          <div className="w-7 h-7 bg-secondary rounded-md flex items-center justify-center flex-shrink-0">
                            <Icon i="book-open" size={14} />
                          </div>
                          <span className="text-sm font-semibold text-foreground">{s.nom}</span>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-md w-fit">
                          {s.code}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {s.coefficient}
                        </span>
                        <span className="text-sm text-foreground">
                          {s.teacher ? `${s.teacher.nom} ${s.teacher.prenom}` : '—'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {s.classesText || '—'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t('hoursPerWeek', { hours: s.volumeHoraire })}
                        </span>
                        {!isTeacher && (
                          <RowActions
                            editHref={`/subjects/${s.id}`}
                            deleteUrl={`/api/subjects/${s.id}`}
                            confirmMessage={t('confirmDelete', { name: s.nom })}
                          />
                        )}
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

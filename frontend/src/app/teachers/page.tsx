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
  title: 'Enseignants',
};

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Full staff roster — gated to the 'teachers' menu, which is not in a
  // TEACHER account's always-on core set, so a teacher only reaches this
  // page if an admin has explicitly granted it (see GET /api/teachers for
  // the matching API-side gate).
  const staff = await requirePageAuth({ menuKey: 'teachers' });
  const prisma = staff.user.prisma;

  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const t = await getTranslations('teachers.list');
  const STATUT_LABEL: Record<string, string> = {
    TEMPS_PLEIN: t('statusFullTime'),
    VACATAIRE: t('statusPartTime'),
  };

  const allTeachers = await prisma.teacher.findMany({
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  // "Spécialité" and "Classes" are derived live from TeacherAssignment (the
  // matière/classe pairings set on each Subject) rather than read off
  // Teacher.specialite/classesAssignees — those free-text columns have no
  // input anywhere in the add/edit-teacher form and are always empty. This
  // mirrors the same relational ground truth already used for TEACHER-role
  // scoping (see src/lib/server/permissions/teacher-scope.ts).
  const assignments = await prisma.teacherAssignment.findMany({
    include: { subject: { select: { nom: true } }, schoolClass: { select: { name: true } } },
  });
  const specialtiesByTeacher = new Map<string, Set<string>>();
  const classesByTeacher = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!specialtiesByTeacher.has(a.teacherId)) specialtiesByTeacher.set(a.teacherId, new Set());
    specialtiesByTeacher.get(a.teacherId)!.add(a.subject.nom);
    if (!classesByTeacher.has(a.teacherId)) classesByTeacher.set(a.teacherId, new Set());
    classesByTeacher.get(a.teacherId)!.add(a.schoolClass.name);
  }
  const specialiteFor = (teacherId: string) =>
    [...(specialtiesByTeacher.get(teacherId) ?? [])].join(', ');
  const classesFor = (teacherId: string) => [...(classesByTeacher.get(teacherId) ?? [])].join(', ');

  const teachers = query
    ? allTeachers.filter((t) => {
        const haystack = [
          t.nom,
          t.prenom,
          specialiteFor(t.id),
          t.email,
          t.telephone,
          classesFor(t.id),
          STATUT_LABEL[t.statut] ?? t.statut,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query.toLowerCase());
      })
    : allTeachers;

  const totalTeachers = allTeachers.length;
  const tempsPlein = allTeachers.filter((t) => t.statut === 'TEMPS_PLEIN').length;
  const vacataires = allTeachers.filter((t) => t.statut === 'VACATAIRE').length;
  const specialites = new Set(assignments.map((a) => a.subject.nom)).size;
  const pctTempsPlein = totalTeachers > 0 ? Math.round((tempsPlein / totalTeachers) * 100) : 0;
  const pctVacataires = totalTeachers > 0 ? Math.round((vacataires / totalTeachers) * 100) : 0;

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      {/* Sidebar */}
      <Sidebar activeItem="teachers" />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={t('title')}
          subtitle={t('subtitle')}
          searchBasePath="/teachers"
          searchQuery={query}
        />

        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="space-y-6 max-w-5xl">
            {/* KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label={t('totalTeachers')}
                value={String(totalTeachers)}
                trend={t('activeThisYear')}
                trendUp={true}
                icon="graduation-cap"
                iconColor="text-primary"
                iconBg="bg-secondary"
              />
              <StatCard
                label={t('fullTime')}
                value={String(tempsPlein)}
                trend={t('pctOfTotal', { pct: pctTempsPlein })}
                trendUp={true}
                icon="briefcase"
                iconColor="text-accent"
                iconBg="bg-secondary"
              />
              <StatCard
                label={t('partTime')}
                value={String(vacataires)}
                trend={t('pctOfTotal', { pct: pctVacataires })}
                trendUp={true}
                icon="clock"
                iconColor="text-warning"
                iconBg="bg-warning-bg"
              />
              <StatCard
                label={t('subjectsCovered')}
                value={String(specialites)}
                trend={t('distinctSpecialties')}
                trendUp={true}
                icon="book-open"
                iconColor="text-success"
                iconBg="bg-success-bg"
              />
            </div>

            {/* Teachers Table */}
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-5 py-3 bg-muted border-b border-border flex justify-between items-center">
                <h2 className="text-sm font-semibold text-foreground">{t('listTitle')}</h2>
                <Link
                  href="/add-teacher"
                  className="px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-md"
                >
                  {t('addTeacher')}
                </Link>
              </div>

              {/* Mobile: stacked cards (below sm) */}
              <div className="sm:hidden">
                <MobileCardList
                  items={teachers}
                  keyFor={(teacher) => teacher.id}
                  emptyMessage={query ? t('noMatch', { query }) : t('noneYet')}
                  renderCard={(teacher) => (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {teacher.nom} {teacher.prenom}
                        </span>
                        <span
                          className={`text-xs font-semibold shrink-0 ${teacher.statut === 'TEMPS_PLEIN' ? 'text-success' : 'text-warning'}`}
                        >
                          {STATUT_LABEL[teacher.statut] ?? teacher.statut}
                        </span>
                      </div>
                      <CardField
                        label={t('headerSpecialty')}
                        value={specialiteFor(teacher.id) || '—'}
                      />
                      <CardField label={t('headerClasses')} value={classesFor(teacher.id) || '—'} />
                      <CardField
                        label={t('headerContact')}
                        value={teacher.telephone || teacher.email || '—'}
                      />
                      <div className="pt-1.5 flex justify-end">
                        <RowActions
                          editHref={`/teachers/${teacher.id}`}
                          deleteUrl={`/api/teachers/${teacher.id}`}
                          confirmMessage={t('confirmDelete', {
                            name: `${teacher.nom} ${teacher.prenom}`,
                          })}
                        />
                      </div>
                    </>
                  )}
                />
              </div>

              {/* Desktop: grid table (sm and up) */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-6 gap-4 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerName')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerSpecialty')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerStatus')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerClasses')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerContact')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                      {t('headerActions')}
                    </span>
                  </div>

                  {teachers.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                      {query ? t('noMatch', { query }) : t('noneYet')}
                    </div>
                  ) : (
                    <div>
                      {teachers.map((teacher) => (
                        <div
                          key={teacher.id}
                          className="grid grid-cols-6 gap-4 px-5 py-3 border-b border-border hover:bg-input items-center text-sm"
                        >
                          <span className="font-semibold text-foreground">
                            {teacher.nom} {teacher.prenom}
                          </span>
                          <span className="text-foreground">
                            {specialiteFor(teacher.id) || '—'}
                          </span>
                          <span
                            className={`text-xs font-semibold ${teacher.statut === 'TEMPS_PLEIN' ? 'text-success' : 'text-warning'}`}
                          >
                            {STATUT_LABEL[teacher.statut] ?? teacher.statut}
                          </span>
                          <span className="text-muted-foreground">
                            {classesFor(teacher.id) || '—'}
                          </span>
                          <span className="text-muted-foreground">
                            {teacher.telephone || teacher.email || '—'}
                          </span>
                          <RowActions
                            editHref={`/teachers/${teacher.id}`}
                            deleteUrl={`/api/teachers/${teacher.id}`}
                            confirmMessage={t('confirmDelete', {
                              name: `${teacher.nom} ${teacher.prenom}`,
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

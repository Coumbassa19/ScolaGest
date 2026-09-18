import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import ClassFilterSelect from '@/components/ClassFilterSelect';
import AddScheduleEntryForm from '@/components/forms/AddScheduleEntryForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Emploi du temps',
};

const JOUR_KEYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'] as const;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'schedule' });
  const prisma = staff.user.prisma;
  const isTeacher = staff.user.role === 'TEACHER';

  const { classId } = await searchParams;
  const t = await getTranslations('schedule.list');
  const td = await getTranslations('schedule.days');
  const JOURS = JOUR_KEYS.map((key) => ({ key, label: td(key) }));

  const [classes, entries, subjects] = await Promise.all([
    prisma.schoolClass.findMany({ orderBy: [{ level: 'desc' }, { name: 'asc' }] }),
    prisma.scheduleEntry.findMany({
      where: {
        ...(classId ? { classId } : {}),
        // A TEACHER only sees their own timetable, never the whole
        // school's — the weekly grid otherwise shows every teacher's
        // sessions (mirrors the same scoping in GET /api/schedule).
        ...(isTeacher ? { teacherId: staff.user.teacherId ?? '' } : {}),
      },
      include: { schoolClass: true, subject: true, teacher: true },
      orderBy: { heureDebut: 'asc' },
    }),
    prisma.subject.findMany({
      include: { teacher: true },
      orderBy: { nom: 'asc' },
    }),
  ]);

  const timeSlots = [...new Set(entries.map((e) => `${e.heureDebut}-${e.heureFin}`))].sort();

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      {/* Sidebar */}
      <Sidebar activeItem="schedule" />

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
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
                {t('title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
            </div>
            {!isTeacher && (
              <AddScheduleEntryForm
                classes={classes.map((c) => ({ id: c.id, name: c.name }))}
                subjects={subjects.map((s) => ({
                  id: s.id,
                  nom: s.nom,
                  teacherId: s.teacherId,
                  teacherLabel: s.teacher ? `${s.teacher.nom} ${s.teacher.prenom}` : null,
                }))}
              />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="space-y-6">
            {/* Filter */}
            <div className="flex flex-wrap items-center gap-2 md:gap-4 justify-between">
              <span className="text-sm font-semibold text-foreground px-1">
                {t('slotsScheduled', { count: entries.length })}
              </span>
              <div className="max-w-xs w-full sm:w-64">
                <ClassFilterSelect
                  classes={classes.map((c) => ({ id: c.id, name: c.name }))}
                  selected={classId ?? ''}
                  basePath="/schedule"
                />
              </div>
            </div>

            {/* Weekly Schedule */}
            {timeSlots.length === 0 ? (
              <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
                {t('noSlots')}
              </div>
            ) : (
              <>
                {/* Mobile: one card per day, listing that day's slots
                    chronologically — a day×time grid doesn't fit a phone
                    screen the way a class or student list does, so this
                    trades the week-at-a-glance view for a scrollable,
                    fully-readable agenda instead of tiny horizontally-
                    scrolled grid cells. */}
                <div className="sm:hidden space-y-4">
                  {JOURS.map((j) => {
                    const dayEntries = entries
                      .filter((e) => e.jour === j.key)
                      .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
                    if (dayEntries.length === 0) return null;
                    return (
                      <div
                        key={j.key}
                        className="bg-surface rounded-lg border border-border overflow-hidden"
                      >
                        <div className="px-4 py-2 bg-muted border-b border-border">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {j.label}
                          </h3>
                        </div>
                        <div className="divide-y divide-border">
                          {dayEntries.map((e) => (
                            <div key={e.id} className="px-4 py-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-semibold text-foreground">
                                  {e.heureDebut}–{e.heureFin}
                                </span>
                                {!isTeacher && (
                                  <Link
                                    href={`/schedule/${e.id}`}
                                    className="text-xs font-semibold text-accent"
                                  >
                                    {t('edit')}
                                  </Link>
                                )}
                              </div>
                              <div className="text-sm text-primary font-semibold">
                                {e.schoolClass.name}
                              </div>
                              <div className="text-sm text-foreground">{e.subject?.nom ?? '—'}</div>
                              {e.teacher && (
                                <div className="text-xs text-muted-foreground">
                                  {e.teacher.nom}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: day × time grid (sm and up) */}
                <div className="hidden sm:block bg-surface rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse">
                    <thead>
                      <tr>
                        <th className="border-r border-border px-4 py-3 text-left bg-muted">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {t('headerTime')}
                          </span>
                        </th>
                        {JOURS.map((j) => (
                          <th
                            key={j.key}
                            className="border-r border-border px-4 py-3 text-center bg-muted last:border-r-0"
                          >
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              {j.label}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {timeSlots.map((slot) => (
                        <tr key={slot} className="border-t border-border">
                          <td className="border-r border-border px-4 py-3 bg-muted">
                            <span className="text-sm font-semibold text-foreground">{slot}</span>
                          </td>
                          {JOURS.map((j) => {
                            const [heureDebut, heureFin] = slot.split('-') as [string, string];
                            const match = entries.find(
                              (e) =>
                                e.jour === j.key &&
                                e.heureDebut === heureDebut &&
                                e.heureFin === heureFin,
                            );
                            return (
                              <td
                                key={j.key}
                                className="border-r border-border px-4 py-3 last:border-r-0"
                              >
                                {match ? (
                                  <div className="bg-secondary rounded-md p-2">
                                    <div className="text-xs font-semibold text-primary">
                                      {match.schoolClass.name}
                                    </div>
                                    <div className="text-xs text-foreground font-medium">
                                      {match.subject?.nom ?? '—'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {match.teacher ? `${match.teacher.nom}` : ''}
                                    </div>
                                    {!isTeacher && (
                                      <Link
                                        href={`/schedule/${match.id}`}
                                        className="text-xs font-semibold text-accent hover:underline"
                                      >
                                        {t('edit')}
                                      </Link>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground text-center py-8">
                                    —
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              </>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 md:gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-secondary rounded-md"></div>
                <span className="text-muted-foreground">{t('legendScheduled')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-muted rounded-md"></div>
                <span className="text-muted-foreground">{t('legendUnscheduled')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

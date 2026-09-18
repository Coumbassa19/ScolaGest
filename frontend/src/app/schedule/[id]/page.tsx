import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import AddScheduleEntryForm from '@/components/forms/AddScheduleEntryForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Modifier le cours',
};

export default async function EditScheduleEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Editing timetable configuration stays an admin/direction action — see
  // PATCH/DELETE /api/schedule/[id] for why TEACHER is blocked here too.
  const staff = await requirePageAuth({ menuKey: 'schedule' });
  const prisma = staff.user.prisma;
  if (staff.user.role === 'TEACHER') redirect('/403');

  const { id } = await params;

  const [entry, classes, subjects] = await Promise.all([
    prisma.scheduleEntry.findUnique({
      where: { id },
      include: { schoolClass: true, teacher: true },
    }),
    prisma.schoolClass.findMany({ orderBy: [{ level: 'desc' }, { name: 'asc' }] }),
    prisma.subject.findMany({ include: { teacher: true }, orderBy: { nom: 'asc' } }),
  ]);

  if (!entry) notFound();
  const t = await getTranslations('schedule.detail');

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="schedule" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/schedule"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title', { className: entry.schoolClass.name })}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <AddScheduleEntryForm
            entryId={entry.id}
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            subjects={subjects.map((s) => ({
              id: s.id,
              nom: s.nom,
              teacherId: s.teacherId,
              teacherLabel: s.teacher ? `${s.teacher.nom} ${s.teacher.prenom}` : null,
            }))}
            initialData={{
              classId: entry.classId,
              subjectId: entry.subjectId ?? '',
              jour: entry.jour as 'LUNDI' | 'MARDI' | 'MERCREDI' | 'JEUDI' | 'VENDREDI' | 'SAMEDI',
              heureDebut: entry.heureDebut,
              heureFin: entry.heureFin,
            }}
          />
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import ImportGradesForm from '@/components/forms/ImportGradesForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Importer des notes',
};

export default async function ImportGradesPage() {
  // Same TEACHER block as POST /api/grades/import — bulk-importing writes
  // grades across every subject for a class in one shot, not just the
  // teacher's own, so it's admin/direction-only (same call as
  // add-subject/subjects/[id]).
  const staff = await requirePageAuth({ menuKey: 'grades' });
  const prisma = staff.user.prisma;
  if (staff.user.role === 'TEACHER') redirect('/403');

  const t = await getTranslations('grades.importPage');
  const [classes, subjects, academicYears] = await Promise.all([
    prisma.schoolClass.findMany({
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.subject.findMany({
      orderBy: { nom: 'asc' },
      select: { id: true, nom: true },
    }),
    prisma.academicYear.findMany({
      orderBy: [{ isCurrent: 'desc' }, { label: 'desc' }],
      select: { label: true },
    }),
  ]);

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="grades" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/grades"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <ImportGradesForm
            classes={classes}
            academicYears={academicYears.map((y) => y.label)}
            subjects={subjects}
          />
        </div>
      </div>
    </div>
  );
}

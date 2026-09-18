import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import ReregisterStudentForm from '@/components/forms/ReregisterStudentForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Inscrire un ancien élève',
};

export default async function ReregisterStudentPage() {
  const staff = await requirePageAuth({ menuKey: 'students' });
  const prisma = staff.user.prisma;
  const t = await getTranslations('students.reregister');
  const [classes, academicYears] = await Promise.all([
    prisma.schoolClass.findMany({
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.academicYear.findMany({
      orderBy: [{ isCurrent: 'desc' }, { label: 'desc' }],
      select: { label: true },
    }),
  ]);

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      {/* Sidebar */}
      <Sidebar
        activeItem="students"
        activeSubmenu="students-reregister"
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
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title')}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <ReregisterStudentForm
            classes={classes}
            academicYears={academicYears.map((y) => y.label)}
          />
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import AttendanceRegister from '@/components/forms/AttendanceRegister';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { getTeacherClassIds } from '@/lib/server/permissions/teacher-scope';

export const metadata: Metadata = {
  title: 'Absences',
};

export default async function AbsencesPage() {
  const staff = await requirePageAuth({ menuKey: 'absences' });
  const prisma = staff.user.prisma;
  const t = await getTranslations('absences');

  let classes = await prisma.schoolClass.findMany({
    select: { id: true, name: true },
    orderBy: [{ level: 'desc' }, { name: 'asc' }],
  });

  if (staff.user.role === 'TEACHER') {
    if (!staff.user.teacherId) {
      classes = [];
    } else {
      const classIds = await getTeacherClassIds(prisma, staff.user.teacherId);
      classes = classes.filter((c) => classIds.includes(c.id));
    }
  }

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="absences" />

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
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <AttendanceRegister classes={classes} />
        </div>
      </div>
    </div>
  );
}

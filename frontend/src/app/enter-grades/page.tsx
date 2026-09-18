import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import EnterGradesForm from '@/components/forms/EnterGradesForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { getTeacherClassIds, getTeacherSubjectIds } from '@/lib/server/permissions/teacher-scope';

export const metadata: Metadata = {
  title: 'Saisir les notes',
};

export default async function EnterGradesPage() {
  const staff = await requirePageAuth({ menuKey: 'grades' });
  const prisma = staff.user.prisma;
  const isTeacher = staff.user.role === 'TEACHER';
  const [teacherClassIds, teacherSubjectIds] =
    isTeacher && staff.user.teacherId
      ? await Promise.all([
          getTeacherClassIds(prisma, staff.user.teacherId),
          getTeacherSubjectIds(prisma, staff.user.teacherId),
        ])
      : [null, null];

  const t = await getTranslations('grades.enter');
  const [classes, subjects, academicYears] = await Promise.all([
    prisma.schoolClass.findMany({
      where: teacherClassIds ? { id: { in: teacherClassIds } } : {},
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.subject.findMany({
      where: teacherSubjectIds ? { id: { in: teacherSubjectIds } } : {},
      orderBy: { nom: 'asc' },
      select: { id: true, nom: true, coefficient: true },
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
        </div>

        {classes.length === 0 || subjects.length === 0 ? (
          <div className="flex-1 px-4 py-10 md:px-8 text-center text-sm text-muted-foreground">
            {classes.length === 0 ? t('noClasses') : t('noSubjects')}
          </div>
        ) : (
          <EnterGradesForm
            classes={classes}
            subjects={subjects}
            academicYears={academicYears.map((y) => y.label)}
          />
        )}
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import AddSubjectForm from '@/components/forms/AddSubjectForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Ajouter une matière',
};

export default async function AddSubjectPage() {
  const staff = await requirePageAuth({ menuKey: 'subjects' });
  const prisma = staff.user.prisma;
  if (staff.user.role === 'TEACHER') redirect('/403');

  const t = await getTranslations('subjects.add');
  const [teachers, classes] = await Promise.all([
    prisma.teacher.findMany({
      select: { id: true, nom: true, prenom: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
    prisma.schoolClass.findMany({
      select: { id: true, name: true },
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
    }),
  ]);

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="subjects" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/subjects"
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
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6 overflow-y-auto">
          <AddSubjectForm teachers={teachers} classes={classes} />
        </div>
      </div>
    </div>
  );
}

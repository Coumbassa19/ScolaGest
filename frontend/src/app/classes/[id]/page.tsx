import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import AddClassForm from '@/components/forms/AddClassForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Modifier la classe',
};

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePageAuth({ menuKey: 'students' });
  const prisma = staff.user.prisma;
  const { id } = await params;

  const schoolClass = await prisma.schoolClass.findUnique({ where: { id } });
  if (!schoolClass) notFound();
  const t = await getTranslations('classes.detail');

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="students"
        activeSubmenu="students-classes"
        expandedMenu="students"
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/classes"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {schoolClass.name}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <AddClassForm
            classId={schoolClass.id}
            initialData={{ name: schoolClass.name, level: schoolClass.level }}
          />
        </div>
      </div>
    </div>
  );
}

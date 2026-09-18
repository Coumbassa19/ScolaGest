import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import AddTeacherForm from '@/components/forms/AddTeacherForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Fiche enseignant',
};

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // HR-record edit page — same 'teachers' menu gate as the list page.
  const staff = await requirePageAuth({ menuKey: 'teachers' });
  const prisma = staff.user.prisma;

  const { id } = await params;

  const teacher = await prisma.teacher.findUnique({ where: { id } });
  if (!teacher) notFound();
  const t = await getTranslations('teachers.detail');

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="teachers" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/teachers"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {teacher.nom} {teacher.prenom}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <AddTeacherForm
            teacherId={teacher.id}
            initialData={{
              nom: teacher.nom,
              prenom: teacher.prenom,
              email: teacher.email ?? '',
              telephone: teacher.telephone ?? '',
            }}
          />
        </div>
      </div>
    </div>
  );
}

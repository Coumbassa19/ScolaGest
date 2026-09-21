import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import AddStudentForm from '@/components/forms/AddStudentForm';
import ParentAccountPanel from '@/components/forms/ParentAccountPanel';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Fiche élève',
};

function toDateInputValue(d: Date | null): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePageAuth({ menuKey: 'students' });
  const prisma = staff.user.prisma;
  const { id } = await params;

  const [student, classes, academicYears, parentLinks] = await Promise.all([
    prisma.student.findUnique({ where: { id } }),
    prisma.schoolClass.findMany({ orderBy: [{ level: 'desc' }, { name: 'asc' }] }),
    prisma.academicYear.findMany({
      orderBy: [{ isCurrent: 'desc' }, { label: 'desc' }],
      select: { label: true },
    }),
    prisma.parentStudent.findMany({
      where: { studentId: id },
      include: { parentUser: { select: { id: true, email: true, name: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!student) notFound();
  const t = await getTranslations('students.detail');

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="students" activeSubmenu="students-list" expandedMenu="students" />

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
            {student.nom} {student.prenom}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('matriculeLabel', { matricule: student.matricule })}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <AddStudentForm
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            academicYears={academicYears.map((y) => y.label)}
            studentId={student.id}
            initialData={{
              nom: student.nom,
              prenom: student.prenom,
              dateNaissance: toDateInputValue(student.dateNaissance),
              ville: student.ville ?? '',
              quartier: student.quartier ?? '',
              sexe: student.sexe === 'F' ? 'F' : 'M',
              classId: student.classId,
              anneeScolaire: student.anneeScolaire,
              matricule: student.matricule,
              photoUrl: student.photoUrl ?? '',
              parentNom: student.parentNom ?? '',
              parentTelephone: student.parentTelephone ?? '',
              parentEmail: student.parentEmail ?? '',
            }}
          />

          <div className="mt-6">
            <ParentAccountPanel
              studentId={student.id}
              initialLinks={parentLinks.map((l) => ({
                id: l.id,
                relation: l.relation,
                createdAt: l.createdAt.toISOString(),
                parentUser: l.parentUser,
              }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

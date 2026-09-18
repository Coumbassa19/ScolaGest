import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import ClassFilterSelect from '@/components/ClassFilterSelect';
import RowActions from '@/components/RowActions';
import TextFilterInput from '@/components/TextFilterInput';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Liste des élèves',
};

interface StudentRow {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
}

interface ClassGroup {
  id: string;
  name: string;
  students: StudentRow[];
}

async function ClassTable({
  title,
  students,
  search,
}: {
  title: string;
  students: StudentRow[];
  search?: string | undefined;
}) {
  const t = await getTranslations('students.list');
  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      <div className="px-5 py-3 bg-muted border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {/* Mobile: stacked cards (below sm) */}
      <div className="sm:hidden">
        <MobileCardList
          items={students}
          keyFor={(student) => student.id}
          emptyMessage={search ? t('noStudentsMatch', { search }) : t('noStudentsInClass')}
          renderCard={(student) => (
            <>
              <div className="font-semibold text-foreground text-sm">
                {student.nom} {student.prenom}
              </div>
              <CardField label={t('headerMatricule')} value={student.matricule} />
              <CardField label={t('headerClass')} value={title} />
              <div className="pt-1.5 flex justify-end">
                <RowActions
                  editHref={`/students/${student.id}`}
                  deleteUrl={`/api/students/${student.id}`}
                  confirmMessage={t('confirmDelete', { name: `${student.nom} ${student.prenom}` })}
                />
              </div>
            </>
          )}
        />
      </div>

      {/* Desktop: grid table (sm and up) */}
      <div className="hidden sm:block overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-5 gap-4 px-5 py-3 bg-muted border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('headerMatricule')}
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('headerLastName')}
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('headerFirstName')}
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('headerClass')}
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
              {t('headerActions')}
            </span>
          </div>
          <div>
            {students.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                {search ? t('noStudentsMatch', { search }) : t('noStudentsInClass')}
              </div>
            ) : (
              students.map((student) => (
                <div
                  key={student.id}
                  className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-border hover:bg-input items-center"
                >
                  <span className="text-sm font-semibold text-foreground">{student.matricule}</span>
                  <span className="text-sm text-foreground">{student.nom}</span>
                  <span className="text-sm text-foreground">{student.prenom}</span>
                  <span className="text-sm text-muted-foreground">{title}</span>
                  <RowActions
                    editHref={`/students/${student.id}`}
                    deleteUrl={`/api/students/${student.id}`}
                    confirmMessage={t('confirmDelete', { name: `${student.nom} ${student.prenom}` })}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; search?: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'students' });
  const prisma = staff.user.prisma;
  const { classId, search: rawSearch } = await searchParams;
  const search = rawSearch?.trim() || undefined;
  const t = await getTranslations('students.list');

  const classes = await prisma.schoolClass.findMany({
    ...(classId ? { where: { id: classId } } : {}),
    orderBy: [{ level: 'desc' }, { name: 'asc' }],
    include: {
      students: {
        ...(search
          ? {
              where: {
                OR: [
                  { nom: { contains: search, mode: 'insensitive' } },
                  { prenom: { contains: search, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
        select: { id: true, matricule: true, nom: true, prenom: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      },
    },
  });

  const allClasses = classId
    ? await prisma.schoolClass.findMany({ orderBy: [{ level: 'desc' }, { name: 'asc' }] })
    : classes;

  const groups: ClassGroup[] = classes.map((c) => ({
    id: c.id,
    name: c.name,
    students: c.students,
  }));

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      {/* Sidebar */}
      <Sidebar
        activeItem="students"
        activeSubmenu="students-list"
        expandedMenu="students"
      />

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
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
              {t('title')}
            </h1>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              <TextFilterInput
                basePath="/students"
                currentQuery={{ classId, search }}
                placeholder={t('searchPlaceholder')}
              />
              <Link
                href="/students/import"
                className="px-4 py-2 border border-border text-foreground text-sm font-semibold rounded-md bg-surface text-center"
              >
                {t('importExcel')}
              </Link>
              <Link
                href="/add-student"
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md text-center"
              >
                {t('addStudent')}
              </Link>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="space-y-4 mb-6">
            {/* Filter by Class */}
            <div className="max-w-xs">
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('filterByClass')}
              </label>
              <ClassFilterSelect
                classes={allClasses.map((c) => ({ id: c.id, name: c.name }))}
                selected={classId ?? ''}
                basePath="/students"
              />
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {t('noClasses')}
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <ClassTable key={g.id} title={g.name} students={g.students} search={search} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

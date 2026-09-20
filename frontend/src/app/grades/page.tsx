import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import QueryFilterSelect from '@/components/QueryFilterSelect';
import TextFilterInput from '@/components/TextFilterInput';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { formatRang } from '@/lib/rang';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { getTeacherClassIds, getTeacherSubjectIds } from '@/lib/server/permissions/teacher-scope';

export const metadata: Metadata = {
  title: 'Notes & Résultats',
};

const PERIODE_VALUES = ['T1', 'T2', 'T3'] as const;

// Thresholds are proportions of `max` (the class's cycle grading scale —
// see Cycles), matching src/lib/bulletin-format.ts's getAppreciationKey.
function noteColor(n: number | null, max = 20): string {
  if (n === null) return 'text-muted-foreground';
  if (n >= max * 0.7) return 'text-success';
  if (n >= max * 0.5) return 'text-foreground';
  return 'text-warning';
}

export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{
    classId?: string;
    periode?: string;
    anneeScolaire?: string;
    search?: string;
  }>;
}) {
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

  const sp = await searchParams;
  const t = await getTranslations('grades.list');
  const tp = await getTranslations('grades.periods');
  const locale = await getLocale();
  const PERIODES = PERIODE_VALUES.map((value) => ({ value, label: tp(value) }));
  const [classes, academicYears] = await Promise.all([
    prisma.schoolClass.findMany({
      where: teacherClassIds ? { id: { in: teacherClassIds } } : {},
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
      include: { cycle: { select: { noteMax: true } } },
    }),
    prisma.academicYear.findMany({
      orderBy: [{ isCurrent: 'desc' }, { label: 'desc' }],
      select: { label: true },
    }),
  ]);
  // A teacher's ?classId= from a bookmark/stale link that isn't (or no
  // longer is) one of theirs falls back to their first assigned class
  // instead of erroring — `classes` above is already scoped, so this can
  // never leak another teacher's class.
  const classId =
    (sp.classId && classes.some((c) => c.id === sp.classId) ? sp.classId : classes[0]?.id) ||
    undefined;
  // The class's cycle grading scale ("noté sur") — see Cycles. Falls back to
  // 20 only when no class is selected yet (nothing to grade against).
  const classNoteMax = classes.find((c) => c.id === classId)?.cycle.noteMax ?? 20;
  const periode = sp.periode || 'T1';
  const anneeScolaire = sp.anneeScolaire || academicYears[0]?.label || '2024-2025';
  const search = sp.search?.trim() || undefined;

  const students = classId
    ? await prisma.student.findMany({
        where: {
          classId,
          ...(search
            ? {
                OR: [
                  { nom: { contains: search, mode: 'insensitive' } },
                  { prenom: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      })
    : [];

  const grades = classId
    ? await prisma.grade.findMany({
        where: {
          classId,
          periode,
          anneeScolaire,
          ...(teacherSubjectIds ? { subjectId: { in: teacherSubjectIds } } : {}),
        },
        include: { subject: true },
      })
    : [];

  const subjectMap = new Map<
    string,
    { id: string; nom: string; code: string; coefficient: number }
  >();
  for (const g of grades) {
    if (!subjectMap.has(g.subjectId)) {
      subjectMap.set(g.subjectId, {
        id: g.subjectId,
        nom: g.subject.nom,
        code: g.subject.code,
        coefficient: g.subject.coefficient,
      });
    }
  }
  const subjects = [...subjectMap.values()].sort((a, b) => a.nom.localeCompare(b.nom));

  const noteByStudentSubject = new Map<string, number>();
  for (const g of grades) noteByStudentSubject.set(`${g.studentId}:${g.subjectId}`, g.valeur);

  function getMoyenne(studentId: string): number | null {
    let total = 0;
    let coeffTotal = 0;
    for (const s of subjects) {
      const note = noteByStudentSubject.get(`${studentId}:${s.id}`);
      if (note !== undefined) {
        total += note * s.coefficient;
        coeffTotal += s.coefficient;
      }
    }
    return coeffTotal > 0 ? total / coeffTotal : null;
  }

  const sortedByMoyenne = students
    .map((s) => ({ student: s, moyenne: getMoyenne(s.id) }))
    .sort((a, b) => (b.moyenne ?? -1) - (a.moyenne ?? -1));

  // Standard competition ranking: tied moyennes share a rank, and the next
  // rank skips ahead by the number of students tied (1, 1, 3, 4...).
  // Students without a moyenne yet aren't ranked.
  let rang = 0;
  let previousMoyenne: number | null = null;
  const rows = sortedByMoyenne.map((r, i) => {
    if (r.moyenne === null) return { ...r, rang: null };
    if (r.moyenne !== previousMoyenne) {
      rang = i + 1;
      previousMoyenne = r.moyenne;
    }
    return { ...r, rang };
  });

  // How many students share each rank, to know when to show "Nex" instead
  // of the plain ordinal.
  const rangCounts = new Map<number, number>();
  for (const r of rows) {
    if (r.rang !== null) rangCounts.set(r.rang, (rangCounts.get(r.rang) ?? 0) + 1);
  }

  const moyennesValides = rows.map((r) => r.moyenne).filter((m): m is number => m !== null);
  const moyenneClasse =
    moyennesValides.length > 0
      ? moyennesValides.reduce((a, b) => a + b, 0) / moyennesValides.length
      : null;
  const auDessus = moyennesValides.filter((m) => m >= (moyenneClasse ?? 0)).length;
  const enDifficulte = moyennesValides.filter((m) => m < 10).length;
  const noteMax = grades.length > 0 ? Math.max(...grades.map((g) => g.valeur)) : null;

  const gridCols = {
    gridTemplateColumns: `2fr repeat(${Math.max(subjects.length, 1)}, 1fr) 1fr 70px 80px`,
  };

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="grades" />

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
            <div>
              <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
                {t('title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              <TextFilterInput
                basePath="/grades"
                currentQuery={{ classId, periode, anneeScolaire, search }}
                placeholder={t('searchPlaceholder')}
              />
              {!isTeacher && (
                <Link
                  href="/grades/import"
                  className="px-4 py-2 border border-border text-foreground text-sm font-semibold rounded-md bg-surface text-center"
                >
                  {t('importExcel')}
                </Link>
              )}
              <Link
                href="/enter-grades"
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md text-center"
              >
                {t('enterGrades')}
              </Link>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 md:px-8 border-b border-border bg-secondary flex flex-wrap items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{t('classLabel')}</span>
            <QueryFilterSelect
              param="classId"
              basePath="/grades"
              currentQuery={{ classId, periode, anneeScolaire, search }}
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{t('periodLabel')}</span>
            <QueryFilterSelect
              param="periode"
              basePath="/grades"
              currentQuery={{ classId, periode, anneeScolaire, search }}
              options={PERIODES}
            />
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <span className="text-sm font-semibold text-foreground">{t('yearLabel')}</span>
            <QueryFilterSelect
              param="anneeScolaire"
              basePath="/grades"
              currentQuery={{ classId, periode, anneeScolaire, search }}
              options={academicYears.map((y) => ({ value: y.label, label: y.label }))}
            />
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-4 py-3 md:px-8 border-b border-border flex flex-wrap gap-4 md:gap-10">
          <div>
            <span className="text-xl font-headings font-semibold text-foreground">
              {students.length}
            </span>
            <p className="text-xs text-muted-foreground">{t('statStudents')}</p>
          </div>
          <div className="w-px bg-border"></div>
          <div>
            <span className="text-xl font-headings font-semibold text-success">
              {moyenneClasse !== null ? moyenneClasse.toFixed(1) : '—'}
            </span>
            <p className="text-xs text-muted-foreground">{t('statClassAverage')}</p>
          </div>
          <div className="w-px bg-border"></div>
          <div>
            <span className="text-xl font-headings font-semibold text-foreground">{auDessus}</span>
            <p className="text-xs text-muted-foreground">{t('statAboveAverage')}</p>
          </div>
          <div className="w-px bg-border"></div>
          <div>
            <span className="text-xl font-headings font-semibold text-warning">{enDifficulte}</span>
            <p className="text-xs text-muted-foreground">{t('statStruggling')}</p>
          </div>
          <div className="w-px bg-border"></div>
          <div>
            <span className="text-xl font-headings font-semibold text-foreground">
              {noteMax ?? '—'}
            </span>
            <p className="text-xs text-muted-foreground">{t('statMaxGrade')}</p>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          {!classId ? (
            <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {t('noClasses')}
            </div>
          ) : students.length === 0 ? (
            <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {search ? t('noStudentsMatch', { search }) : t('noStudentsInClass')}
            </div>
          ) : subjects.length === 0 ? (
            <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {t('noGradesYet')}{' '}
              <Link href="/enter-grades" className="text-primary font-semibold">
                {t('enterGradesLink')}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end gap-3">
                <a
                  href={`/api/grades/bulletins/pdf?classId=${classId}&periode=${periode}&anneeScolaire=${anneeScolaire}`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface hover:bg-input"
                >
                  <Icon i="files" size={16} />
                  {t('downloadBulletins')}
                </a>
                <a
                  href={`/api/grades/export?classId=${classId}&periode=${periode}&anneeScolaire=${anneeScolaire}`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface hover:bg-input"
                >
                  <Icon i="download" size={16} />
                  {t('exportExcel')}
                </a>
              </div>
              <div className="bg-surface rounded-lg border border-border overflow-hidden">
                {/* Mobile: stacked cards (below sm) */}
                <div className="sm:hidden">
                  <MobileCardList
                    items={rows}
                    keyFor={(r) => r.student.id}
                    emptyMessage={t('noStudentsInClass')}
                    renderCard={({ student, moyenne, rang }) => (
                      <>
                        <div className="font-semibold text-foreground text-sm">
                          {student.nom} {student.prenom}
                        </div>
                        {subjects.map((m) => {
                          const note = noteByStudentSubject.get(`${student.id}:${m.id}`) ?? null;
                          return (
                            <CardField
                              key={m.id}
                              label={`${m.nom} (${t('coeffAbbrev', { value: m.coefficient })})`}
                              value={
                                <span className={noteColor(note, classNoteMax)}>
                                  {note !== null ? `${note}/${classNoteMax}` : '—'}
                                </span>
                              }
                            />
                          );
                        })}
                        <CardField
                          label={t('headerAverage')}
                          value={
                            <span className={`font-semibold ${noteColor(moyenne, classNoteMax)}`}>
                              {moyenne !== null ? `${moyenne.toFixed(2)}/${classNoteMax}` : '—'}
                            </span>
                          }
                        />
                        <CardField
                          label={t('headerRank')}
                          value={
                            rang !== null
                              ? formatRang(
                                  rang,
                                  student.sexe,
                                  (rangCounts.get(rang) ?? 0) > 1,
                                  locale === 'en' ? 'en' : 'fr',
                                )
                              : '—'
                          }
                        />
                        <div className="pt-1.5 flex justify-end">
                          <Link
                            href={`/bulletin?studentId=${student.id}&periode=${periode}&anneeScolaire=${anneeScolaire}`}
                            className="text-sm font-semibold text-primary"
                          >
                            {t('bulletinLink')}
                          </Link>
                        </div>
                      </>
                    )}
                  />
                </div>

                {/* Desktop: grid table (sm and up) */}
                <div className="hidden sm:block overflow-x-auto">
                  <div style={{ minWidth: '760px' }}>
                    {/* Table header */}
                    <div
                      className="grid px-5 py-3 bg-muted border-b border-border"
                      style={gridCols}
                    >
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('headerStudent')}
                      </span>
                      {subjects.map((m) => (
                        <div key={m.id} className="text-center">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {m.nom}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t('coeffAbbrev', { value: m.coefficient })}
                          </div>
                        </div>
                      ))}
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                        {t('headerAverage')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                        {t('headerRank')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                        {t('headerActions')}
                      </span>
                    </div>

                    {/* Rows */}
                    <div>
                      {rows.map(({ student, moyenne, rang }) => (
                        <div
                          key={student.id}
                          className="grid px-5 py-3 border-b border-border items-center"
                          style={gridCols}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {student.nom} {student.prenom}
                            </span>
                          </div>
                          {subjects.map((m) => {
                            const note = noteByStudentSubject.get(`${student.id}:${m.id}`) ?? null;
                            return (
                              <div key={m.id} className="text-center">
                                <span
                                  className={`text-sm font-semibold ${noteColor(note, classNoteMax)}`}
                                >
                                  {note !== null ? note : '—'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  /{classNoteMax}
                                </span>
                              </div>
                            );
                          })}
                          <div className="text-center">
                            <span
                              className={`text-sm font-semibold ${noteColor(moyenne, classNoteMax)}`}
                            >
                              {moyenne !== null ? moyenne.toFixed(2) : '—'}
                            </span>
                            <span className="text-xs text-muted-foreground">/{classNoteMax}</span>
                          </div>
                          <div className="text-center">
                            <span
                              className={`text-sm font-semibold ${rang === 1 ? 'text-success' : 'text-foreground'}`}
                            >
                              {rang !== null
                                ? formatRang(
                                    rang,
                                    student.sexe,
                                    (rangCounts.get(rang) ?? 0) > 1,
                                    locale === 'en' ? 'en' : 'fr',
                                  )
                                : '—'}
                            </span>
                          </div>
                          <div className="flex gap-1 justify-center">
                            <Link
                              href={`/bulletin?studentId=${student.id}&periode=${periode}&anneeScolaire=${anneeScolaire}`}
                              className="text-sm font-semibold text-primary"
                            >
                              {t('bulletinLink')}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer */}
                    <div
                      className="grid px-5 py-3 bg-muted border-t border-border items-center"
                      style={gridCols}
                    >
                      <span className="text-xs font-semibold text-foreground">
                        {t('footerClassAverage')}
                      </span>
                      {subjects.map((m) => {
                        const notes = students
                          .map((s) => noteByStudentSubject.get(`${s.id}:${m.id}`))
                          .filter((n): n is number => n !== undefined);
                        const avg =
                          notes.length > 0
                            ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1)
                            : '—';
                        return (
                          <div key={m.id} className="text-center">
                            <span
                              className={`text-xs font-semibold ${avg !== '—' && parseFloat(avg) >= classNoteMax * 0.5 ? 'text-success' : 'text-warning'}`}
                            >
                              {avg}
                            </span>
                          </div>
                        );
                      })}
                      <div className="text-center">
                        <span className="text-xs font-semibold text-primary">
                          {moyenneClasse !== null ? moyenneClasse.toFixed(1) : '—'}
                        </span>
                      </div>
                      <div></div>
                      <div></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

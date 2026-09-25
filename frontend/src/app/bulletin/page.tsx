import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Icon from '@/components/global/Icon';
import BulletinObservation from '@/components/forms/BulletinObservation';
import PrintButton from '@/components/PrintButton';
import { formatRang } from '@/lib/rang';
import {
  computeInitials,
  getAppreciationKey,
  defaultObservationKey,
  decisionKey,
} from '@/lib/bulletin-format';
import { computeClassRanking } from '@/lib/server/bulletin';
import { buildMoyenneMatiereMap, computeMoyenneGenerale } from '@/lib/server/grades/moyenne';
import { getSchoolSettings } from '@/lib/server/school-settings';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { requireSchoolId } from '@/lib/server/tenant/context';

export const metadata: Metadata = {
  title: 'Bulletin de Notes',
};

function fmtDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function BulletinPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; periode?: string; anneeScolaire?: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'grades' });
  const prisma = staff.user.prisma;
  const schoolId = requireSchoolId(staff.user.schoolId);
  const t = await getTranslations('bulletin');
  const tp = await getTranslations('grades.periods');
  const locale = await getLocale();
  const sp = await searchParams;
  const periode = sp.periode || 'T1';
  const periodeLabel = (['T1', 'T2', 'T3'] as const).includes(periode as 'T1' | 'T2' | 'T3')
    ? tp(periode as 'T1' | 'T2' | 'T3')
    : periode;

  const student = sp.studentId
    ? await prisma.student.findUnique({
        where: { id: sp.studentId },
        include: { schoolClass: { include: { cycle: true } } },
      })
    : await prisma.student.findFirst({
        include: { schoolClass: { include: { cycle: true } } },
        orderBy: { createdAt: 'asc' },
      });

  // Defaults to the student's own enrollment year when not specified (e.g.
  // an older bulletin link), so existing links behave exactly as before —
  // grades didn't used to carry a year at all.
  const anneeScolaire = sp.anneeScolaire || student?.anneeScolaire || '2024-2025';

  if (!student) {
    return (
      <div className="bg-background min-h-full font-body flex items-center justify-center px-4 py-10">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-headings font-semibold text-foreground">
            {t('noStudent.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('noStudent.body')}</p>
          <Link
            href="/add-student"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
          >
            {t('noStudent.enrolStudent')}
          </Link>
        </div>
      </div>
    );
  }

  const schoolInfo = await getSchoolSettings(prisma, schoolId);

  const grades = await prisma.grade.findMany({
    where: { studentId: student.id, periode, anneeScolaire },
    include: { subject: true },
    orderBy: { subject: { nom: 'asc' } },
  });

  // One row per subject, deduped (grades now holds several rows per
  // subject — devoirs + composition) — order follows the query above.
  const subjectsUnique = Array.from(new Map(grades.map((g) => [g.subjectId, g.subject])).values());
  const moyenneMatiereByStudentSubject = buildMoyenneMatiereMap(
    grades,
    schoolInfo.coefDevoir,
    schoolInfo.coefComposition,
  );
  function moyenneDevoirsFor(subjectId: string): number | null {
    const devoirs = grades.filter((g) => g.subjectId === subjectId && g.type === 'DEVOIR');
    return devoirs.length > 0
      ? devoirs.reduce((sum, d) => sum + d.valeur, 0) / devoirs.length
      : null;
  }
  function compositionFor(subjectId: string): number | null {
    return (
      grades.find((g) => g.subjectId === subjectId && g.type === 'COMPOSITION')?.valeur ?? null
    );
  }

  const totalCoeff = subjectsUnique.reduce((sum, s) => sum + s.coefficient, 0);
  const moyenne = computeMoyenneGenerale(
    subjectsUnique.map((s) => ({
      moyenne: moyenneMatiereByStudentSubject.get(`${student.id}:${s.id}`) ?? null,
      coefficient: s.coefficient,
    })),
  );
  // The student's class's cycle grading scale ("noté sur") — see Cycles.
  const noteMax = student.schoolClass.cycle.noteMax;

  // Rang dans la classe — same competition-ranking rule as /grades (tied
  // moyennes share a rank, the next rank skips ahead by the tie count),
  // computed once for the whole class and shared with the bulk PDF export.
  const { rankByStudent, totalStudents: totalClasse } = await computeClassRanking(
    prisma,
    student.classId,
    periode,
    anneeScolaire,
    schoolInfo.coefDevoir,
    schoolInfo.coefComposition,
  );
  const myRank = rankByStudent.get(student.id);
  const rang = myRank?.rang ?? null;
  const rangTied = myRank?.tied ?? false;

  const savedRemark = await prisma.bulletinRemark.findUnique({
    where: { studentId_periode: { studentId: student.id, periode } },
  });

  return (
    <div className="bg-background min-h-full font-body">
      {/* Header with controls */}
      <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary sticky top-0 z-10 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-headings font-semibold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {student.nom} {student.prenom} — {periodeLabel} — {anneeScolaire}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <PrintButton />
          <a
            href={`/api/bulletin/pdf?studentId=${student.id}&periode=${periode}&anneeScolaire=${anneeScolaire}`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
          >
            <Icon i="download" size={16} />
            {t('download')}
          </a>
          <Link
            href="/grades"
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md"
          >
            <Icon i="arrow-left" size={16} />
            {t('back')}
          </Link>
        </div>
      </div>

      {/* Bulletin content */}
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-8 md:py-8">
        <div className="bg-white border-2 border-border rounded-lg shadow-sm">
          {/* School Header */}
          <div className="px-4 py-6 md:px-8 border-b-2 border-border text-center">
            <div className="mb-4 flex justify-center">
              {schoolInfo.logoUrl ? (
                // data: URL — next/image can't optimize it, a plain <img> is correct here.
                <img
                  src={schoolInfo.logoUrl}
                  alt={`Logo ${schoolInfo.name}`}
                  className="w-16 h-16 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-primary-foreground font-headings font-bold text-lg">
                    {computeInitials(schoolInfo.name)}
                  </span>
                </div>
              )}
            </div>
            <h1 className="text-xl font-headings font-semibold text-foreground">
              {schoolInfo.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{schoolInfo.address}</p>
            <p className="text-sm text-muted-foreground">
              {schoolInfo.phone} | {schoolInfo.email}
            </p>
            <div className="mt-4 pt-4 border-t border-border text-sm font-semibold text-foreground">
              {t('heading', { period: periodeLabel }).toUpperCase()}
            </div>
          </div>

          {/* Student Info */}
          <div className="px-4 py-6 md:px-8 border-b border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('nameLabel')}
                </p>
                <p className="font-semibold text-foreground mt-1">
                  {student.nom} {student.prenom}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('classLabel')}
                </p>
                <p className="font-semibold text-foreground mt-1">{student.schoolClass.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('matriculeLabel')}
                </p>
                <p className="font-semibold text-foreground mt-1">{student.matricule}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('dobLabel')}
                </p>
                <p className="font-semibold text-foreground mt-1">
                  {student.dateNaissance ? fmtDate(student.dateNaissance, locale) : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Grades Table */}
          <div className="px-4 py-6 md:px-8 border-b border-border overflow-x-auto">
            {grades.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t('noGrades')}</p>
            ) : (
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                      {t('subjectHeader')}
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                      {t('coeffHeader')}
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                      {t('devoirsHeader')}
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                      {t('compositionHeader')}
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                      {t('gradeHeader')}
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                      {t('appreciationHeader')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subjectsUnique.map((s) => {
                    const moyenneMatiere =
                      moyenneMatiereByStudentSubject.get(`${student.id}:${s.id}`) ?? null;
                    const moyenneDevoirs = moyenneDevoirsFor(s.id);
                    const composition = compositionFor(s.id);
                    return (
                      <tr key={s.id} className="border-b border-border">
                        <td className="px-3 py-3 text-sm font-semibold text-foreground">{s.nom}</td>
                        <td className="px-3 py-3 text-sm text-center font-semibold text-foreground">
                          {s.coefficient}
                        </td>
                        <td className="px-3 py-3 text-sm text-center text-foreground">
                          {moyenneDevoirs !== null ? moyenneDevoirs.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-center text-foreground">
                          {composition !== null ? composition : '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-center font-semibold text-foreground">
                          {moyenneMatiere !== null ? moyenneMatiere.toFixed(1) : '—'}/{noteMax}
                        </td>
                        <td className="px-3 py-3 text-sm text-center text-muted-foreground">
                          {moyenneMatiere !== null
                            ? t(`appreciation.${getAppreciationKey(moyenneMatiere, noteMax)}`)
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted border-t-2 border-foreground">
                    <td className="px-3 py-3 text-sm font-semibold text-foreground">
                      {t('generalAverage')}
                    </td>
                    <td className="px-3 py-3 text-sm text-center font-semibold text-foreground">
                      {totalCoeff}
                    </td>
                    <td className="px-3 py-3 text-sm text-center text-muted-foreground">—</td>
                    <td className="px-3 py-3 text-sm text-center text-muted-foreground">—</td>
                    <td className="px-3 py-3 text-sm text-center font-semibold text-primary text-base">
                      {moyenne !== null ? moyenne.toFixed(2) : '—'}/{noteMax}
                    </td>
                    <td className="px-3 py-3 text-sm text-center font-semibold text-foreground">
                      {moyenne !== null
                        ? t(`appreciation.${getAppreciationKey(moyenne, noteMax)}`)
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Comments and Decision */}
          <div className="px-4 py-6 md:px-8 border-b border-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                  {t('councilObservations')}
                </p>
                <BulletinObservation
                  studentId={student.id}
                  periode={periode}
                  initialValue={
                    savedRemark?.observation ??
                    t(`observations.${defaultObservationKey(moyenne, noteMax)}`)
                  }
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                  {t('decisionLabel')}
                </p>
                <div
                  className={`border-2 rounded-md px-3 py-3 min-h-16 flex items-center ${
                    moyenne !== null && moyenne >= noteMax * 0.5
                      ? 'border-success'
                      : 'border-warning'
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${moyenne !== null && moyenne >= noteMax * 0.5 ? 'text-success' : 'text-warning'}`}
                  >
                    {t(`decision.${decisionKey(moyenne, noteMax)}`)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                  {t('rankLabel')}
                </p>
                <div className="border-2 border-primary rounded-md px-3 py-3 min-h-16 flex items-center justify-center">
                  <span className="text-xl font-bold text-primary">
                    {rang !== null
                      ? `${formatRang(rang, student.sexe, rangTied, locale === 'en' ? 'en' : 'fr')}/${totalClasse}`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Signature */}
          <div className="px-4 py-8 md:px-8">
            <div className="flex justify-end">
              <div className="w-48 text-center">
                <div className="border-t-2 border-foreground h-20 mb-2"></div>
                <p className="text-xs font-semibold text-foreground uppercase">{t('director')}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-4 md:px-8 border-t-2 border-border text-center bg-muted rounded-b-md">
            <p className="text-xs text-muted-foreground">{t('officialFooter')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dateLabel', { date: fmtDate(new Date(), locale) })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

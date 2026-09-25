import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import ParentHeader from '@/components/ParentHeader';
import { getAppreciationKey } from '@/lib/bulletin-format';
import { buildMoyenneMatiereMap, computeMoyenneGenerale } from '@/lib/server/grades/moyenne';
import { getSchoolSettings } from '@/lib/server/school-settings';
import { requireParentPage } from '@/lib/server/middleware/require-parent';

export const metadata: Metadata = {
  title: 'Espace parent',
};

function fmt(n: number, locale: string): string {
  return n.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR');
}

function fmtDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const PERIODES = ['T1', 'T2', 'T3'] as const;

export default async function ParentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string; periode?: string }>;
}) {
  const parentCtx = await requireParentPage();
  const prisma = parentCtx.user.prisma;
  const t = await getTranslations('parentPortal');
  const tp = await getTranslations('grades.periods');
  const tAbs = await getTranslations('absences.status');
  const tBulletin = await getTranslations('bulletin');
  const locale = await getLocale();
  const sp = await searchParams;

  const schoolInfo = await getSchoolSettings(prisma, parentCtx.user.schoolId);

  if (parentCtx.user.studentIds.length === 0) {
    return (
      <div className="bg-background min-h-full font-body">
        <ParentHeader schoolName={schoolInfo.name} />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <h2 className="text-lg font-headings font-semibold text-foreground mb-2">
            {t('noChildren.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('noChildren.body')}</p>
        </div>
      </div>
    );
  }

  const students = await prisma.student.findMany({
    where: { id: { in: parentCtx.user.studentIds } },
    include: { schoolClass: { include: { cycle: true } } },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const requestedChildId =
    sp.child && parentCtx.user.studentIds.includes(sp.child) ? sp.child : null;
  const activeStudent = students.find((s) => s.id === requestedChildId) ?? students[0];

  if (!activeStudent) {
    // Defensive: every id in studentIds should resolve to a real Student row
    // (ParentStudent cascades on Student delete), but if a row was removed
    // in a way that raced this read, fail closed instead of crashing.
    return (
      <div className="bg-background min-h-full font-body">
        <ParentHeader schoolName={schoolInfo.name} />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t('noChildren.body')}</p>
        </div>
      </div>
    );
  }

  const currentYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { label: true },
  });
  const anneeScolaire = currentYear?.label ?? activeStudent.anneeScolaire;
  const periode = (PERIODES as readonly string[]).includes(sp.periode ?? '')
    ? (sp.periode as (typeof PERIODES)[number])
    : 'T1';
  const noteMax = activeStudent.schoolClass.cycle.noteMax;

  const [grades, absences, tuitionPlan, scolaritePaidAgg, registrationPayments] = await Promise.all(
    [
      prisma.grade.findMany({
        where: { studentId: activeStudent.id, periode, anneeScolaire },
        include: { subject: true },
        orderBy: { subject: { nom: 'asc' } },
      }),
      prisma.absence.findMany({
        where: { studentId: activeStudent.id },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      // No `select` here on purpose: the tenant-scope extension's ownership
      // check on findUnique reads `result.schoolId`, which a narrower select
      // would silently strip — making a real, same-school row look
      // cross-tenant and return null (see prisma.ts's UNIQUE_READ_OPS).
      prisma.tuitionPlan.findUnique({
        where: { classId_anneeScolaire: { classId: activeStudent.classId, anneeScolaire } },
      }),
      prisma.revenuePayment.aggregate({
        where: { studentId: activeStudent.id, categorie: 'SCOLARITE', anneeScolaire },
        _sum: { montant: true },
      }),
      prisma.revenuePayment.findMany({
        where: { studentId: activeStudent.id, categorie: { in: ['INSCRIPTION', 'REINSCRIPTION'] } },
        orderBy: { date: 'desc' },
      }),
    ],
  );

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
      moyenne: moyenneMatiereByStudentSubject.get(`${activeStudent.id}:${s.id}`) ?? null,
      coefficient: s.coefficient,
    })),
  );

  const dueScolarite = tuitionPlan?.montantAnnuel ?? null;
  const paidScolarite = scolaritePaidAgg._sum.montant ?? 0;
  const resteScolarite = dueScolarite !== null ? Math.max(0, dueScolarite - paidScolarite) : null;
  const displayPaidScolarite =
    dueScolarite !== null ? Math.min(paidScolarite, dueScolarite) : paidScolarite;

  const absenceCounts = absences.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="bg-background min-h-full font-body">
      <ParentHeader schoolName={schoolInfo.name} />

      <div className="max-w-4xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
        {/* Child switcher */}
        {students.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {students.map((s) => (
              <Link
                key={s.id}
                href={`/parent?child=${s.id}`}
                className={`px-4 py-2 text-sm font-semibold rounded-md border ${
                  s.id === activeStudent.id
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-border text-muted-foreground bg-surface'
                }`}
              >
                {s.nom} {s.prenom}
              </Link>
            ))}
          </div>
        )}

        {/* Student summary card */}
        <div className="bg-surface rounded-lg border border-border px-5 py-4">
          <h2 className="text-lg font-headings font-semibold text-foreground">
            {activeStudent.nom} {activeStudent.prenom}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {activeStudent.schoolClass.name} — {anneeScolaire} — {t('matriculeLabel')}{' '}
            {activeStudent.matricule}
          </p>
        </div>

        {/* Notes */}
        <section id="notes" className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="px-5 py-3 bg-muted border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-foreground">{t('gradesTitle')}</h2>
            <div className="flex gap-2">
              {PERIODES.map((p) => (
                <Link
                  key={p}
                  href={`/parent?child=${activeStudent.id}&periode=${p}`}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${
                    p === periode
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {tp(p)}
                </Link>
              ))}
            </div>
          </div>

          {grades.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground text-center">{t('noGrades')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-5 py-2 text-xs font-semibold text-muted-foreground uppercase">
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
                      moyenneMatiereByStudentSubject.get(`${activeStudent.id}:${s.id}`) ?? null;
                    const moyenneDevoirs = moyenneDevoirsFor(s.id);
                    const composition = compositionFor(s.id);
                    return (
                      <tr key={s.id} className="border-b border-border">
                        <td className="px-5 py-2.5 text-sm font-semibold text-foreground">
                          {s.nom}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-center text-foreground">
                          {s.coefficient}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-center text-foreground">
                          {moyenneDevoirs !== null ? moyenneDevoirs.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-center text-foreground">
                          {composition !== null ? composition : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-center font-semibold text-foreground">
                          {moyenneMatiere !== null ? moyenneMatiere.toFixed(1) : '—'}/{noteMax}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-center text-muted-foreground">
                          {moyenneMatiere !== null
                            ? tBulletin(
                                `appreciation.${getAppreciationKey(moyenneMatiere, noteMax)}`,
                              )
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted">
                    <td className="px-5 py-2.5 text-sm font-semibold text-foreground">
                      {t('generalAverage')}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-center font-semibold text-foreground">
                      {totalCoeff}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-center text-muted-foreground">—</td>
                    <td className="px-3 py-2.5 text-sm text-center text-muted-foreground">—</td>
                    <td className="px-3 py-2.5 text-sm text-center font-semibold text-primary">
                      {moyenne !== null ? moyenne.toFixed(2) : '—'}/{noteMax}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-center font-semibold text-foreground">
                      {moyenne !== null
                        ? tBulletin(`appreciation.${getAppreciationKey(moyenne, noteMax)}`)
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Absences */}
        <section
          id="absences"
          className="bg-surface rounded-lg border border-border overflow-hidden"
        >
          <div className="px-5 py-3 bg-muted border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">{t('absencesTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t('absencesSummary', {
                absent: absenceCounts.ABSENT ?? 0,
                late: absenceCounts.LATE ?? 0,
                excused: absenceCounts.EXCUSED ?? 0,
              })}
            </p>
          </div>
          {absences.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground text-center">{t('noAbsences')}</p>
          ) : (
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {absences.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="text-sm text-foreground">{fmtDate(a.date, locale)}</span>
                  <span className="text-sm text-muted-foreground truncate flex-1 text-right">
                    {a.reason || '—'}
                  </span>
                  <span
                    className={`text-xs font-semibold shrink-0 px-2 py-1 rounded-md ${
                      a.status === 'PRESENT'
                        ? 'text-success bg-success/10'
                        : a.status === 'ABSENT'
                          ? 'text-danger bg-danger/10'
                          : 'text-warning bg-warning/10'
                    }`}
                  >
                    {tAbs(a.status as 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Paiements */}
        <section
          id="paiements"
          className="bg-surface rounded-lg border border-border overflow-hidden"
        >
          <div className="px-5 py-3 bg-muted border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">{t('paymentsTitle')}</h2>
          </div>

          <div className="px-5 py-4 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {t('tuitionLabel', { year: anneeScolaire })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-lg font-headings font-semibold text-foreground">
                  {dueScolarite !== null ? `${fmt(dueScolarite, locale)} GNF` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">{t('due')}</p>
              </div>
              <div>
                <p className="text-lg font-headings font-semibold text-success">
                  {fmt(displayPaidScolarite, locale)} GNF
                </p>
                <p className="text-xs text-muted-foreground">{t('paid')}</p>
              </div>
              <div>
                <p
                  className={`text-lg font-headings font-semibold ${
                    resteScolarite !== null && resteScolarite > 0
                      ? 'text-warning'
                      : 'text-foreground'
                  }`}
                >
                  {resteScolarite !== null ? `${fmt(resteScolarite, locale)} GNF` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">{t('remaining')}</p>
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {t('registrationLabel')}
            </p>
            {registrationPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noPayments')}</p>
            ) : (
              <div className="space-y-2">
                {registrationPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">
                      {p.categorie === 'INSCRIPTION' ? t('inscription') : t('reinscription')}
                    </span>
                    <span className="text-muted-foreground">{fmtDate(p.date, locale)}</span>
                    <span className="font-semibold text-success">{fmt(p.montant, locale)} GNF</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

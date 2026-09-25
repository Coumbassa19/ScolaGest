// Shared "moyenne" computation, used everywhere a grade is displayed or
// exported (bulletin, bulletin PDF, /grades, /parent, Excel export) so
// every surface agrees on the same numbers. Pure — no Prisma import — so
// it stays importable from src/lib/server/bulletin-pdf.ts, which isn't
// itself `server-only`.
//
// Two independent weighted averages exist in this app, on two different
// axes, and must not be confused:
//   - computeMoyenneMatiere: WITHIN one subject, blends its devoirs
//     (arithmetic mean) with its composition, weighted by the school's
//     coefDevoir/coefComposition (SchoolSettings).
//   - computeMoyenneGenerale: ACROSS subjects, weighted by each
//     Subject.coefficient — this formula already existed (duplicated
//     across ~8 files) before devoirs/composition were introduced.

export interface AssessmentEntry {
  type: string;
  valeur: number;
}

// A single COMPOSITION row is assumed at most — enforced server-side by
// forcing label="Composition" whenever type="COMPOSITION" (see POST
// /api/grades), never trusting a client-supplied label for that case.
export function computeMoyenneMatiere(
  assessments: AssessmentEntry[],
  coefDevoir: number,
  coefComposition: number,
): number | null {
  const devoirs = assessments.filter((a) => a.type === 'DEVOIR');
  const composition = assessments.find((a) => a.type === 'COMPOSITION');
  const moyenneDevoirs =
    devoirs.length > 0 ? devoirs.reduce((sum, d) => sum + d.valeur, 0) / devoirs.length : null;

  if (moyenneDevoirs !== null && composition) {
    const totalCoef = coefDevoir + coefComposition;
    return totalCoef > 0
      ? (moyenneDevoirs * coefDevoir + composition.valeur * coefComposition) / totalCoef
      : null;
  }
  if (composition) return composition.valeur;
  return moyenneDevoirs;
}

export interface SubjectAverage {
  moyenne: number | null;
  coefficient: number;
}

// The pre-existing across-subjects formula, extracted from its ~8
// duplicated inline forms — behavior unchanged.
export function computeMoyenneGenerale(subjectAverages: SubjectAverage[]): number | null {
  let total = 0;
  let coeffTotal = 0;
  for (const s of subjectAverages) {
    if (s.moyenne !== null) {
      total += s.moyenne * s.coefficient;
      coeffTotal += s.coefficient;
    }
  }
  return coeffTotal > 0 ? total / coeffTotal : null;
}

// Groups a flat list of grade rows by (studentId, subjectId) and reduces
// each group through computeMoyenneMatiere — the convenience most call
// sites need instead of calling computeMoyenneMatiere per pair by hand.
export function buildMoyenneMatiereMap<
  G extends { studentId: string; subjectId: string; type: string; valeur: number },
>(grades: G[], coefDevoir: number, coefComposition: number): Map<string, number | null> {
  const bySubjectStudent = new Map<string, AssessmentEntry[]>();
  for (const g of grades) {
    const key = `${g.studentId}:${g.subjectId}`;
    const list = bySubjectStudent.get(key) ?? [];
    list.push({ type: g.type, valeur: g.valeur });
    bySubjectStudent.set(key, list);
  }
  const result = new Map<string, number | null>();
  for (const [key, assessments] of bySubjectStudent) {
    result.set(key, computeMoyenneMatiere(assessments, coefDevoir, coefComposition));
  }
  return result;
}

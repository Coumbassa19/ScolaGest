// Shared class-ranking computation for a given class/période/année, used by
// both the single-student bulletin (/bulletin) and the bulk PDF export
// (/api/grades/bulletins/pdf) — computed once per class rather than once per
// student, and both read from the same map so the two views can never
// disagree on a student's rank.
//
// Standard competition ranking: tied moyennes share a rank, and the next
// rank skips ahead by the number of students tied (1, 1, 3, 4...). Students
// without a moyenne yet aren't ranked.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export interface ClassRankEntry {
  moyenne: number | null;
  rang: number | null;
  tied: boolean;
}

export interface ClassRanking {
  rankByStudent: Map<string, ClassRankEntry>;
  totalStudents: number;
}

export async function computeClassRanking(
  prisma: PrismaClient,
  classId: string,
  periode: string,
  anneeScolaire: string,
): Promise<ClassRanking> {
  const [classmates, classGrades] = await Promise.all([
    prisma.student.findMany({ where: { classId }, select: { id: true } }),
    prisma.grade.findMany({
      where: { classId, periode, anneeScolaire },
      include: { subject: true },
    }),
  ]);

  const noteByStudentSubject = new Map<string, number>();
  for (const g of classGrades) noteByStudentSubject.set(`${g.studentId}:${g.subjectId}`, g.valeur);
  const subjectCoeffById = new Map<string, number>();
  for (const g of classGrades) {
    if (!subjectCoeffById.has(g.subjectId))
      subjectCoeffById.set(g.subjectId, g.subject.coefficient);
  }

  function moyenneFor(studentId: string): number | null {
    let total = 0;
    let coeffTotal = 0;
    for (const [subjectId, coefficient] of subjectCoeffById) {
      const note = noteByStudentSubject.get(`${studentId}:${subjectId}`);
      if (note !== undefined) {
        total += note * coefficient;
        coeffTotal += coefficient;
      }
    }
    return coeffTotal > 0 ? total / coeffTotal : null;
  }

  const withMoyenne = classmates.map((c) => ({ studentId: c.id, moyenne: moyenneFor(c.id) }));
  const ranked = withMoyenne
    .filter((c): c is { studentId: string; moyenne: number } => c.moyenne !== null)
    .sort((a, b) => b.moyenne - a.moyenne);

  let currentRang = 0;
  let previousMoyenne: number | null = null;
  const rangByStudentId = new Map<string, number>();
  const rangCounts = new Map<number, number>();
  ranked.forEach((c, i) => {
    if (c.moyenne !== previousMoyenne) {
      currentRang = i + 1;
      previousMoyenne = c.moyenne;
    }
    rangByStudentId.set(c.studentId, currentRang);
    rangCounts.set(currentRang, (rangCounts.get(currentRang) ?? 0) + 1);
  });

  const rankByStudent = new Map<string, ClassRankEntry>();
  for (const c of withMoyenne) {
    const rang = rangByStudentId.get(c.studentId) ?? null;
    rankByStudent.set(c.studentId, {
      moyenne: c.moyenne,
      rang,
      tied: rang !== null && (rangCounts.get(rang) ?? 0) > 1,
    });
  }

  return { rankByStudent, totalStudents: classmates.length };
}

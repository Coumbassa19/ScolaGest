// Enforces School.plan's student cap (ESSENTIEL: 700, CROISSANCE:
// unlimited) — consumed by POST /api/students and POST /api/students/import
// so a school can never silently enroll more students than its plan (and
// therefore its bill) accounts for.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { planConfig } from './constants';

export interface StudentCapacity {
  limit: number | null;
  current: number;
  /** How many more students can be added right now (Infinity when unlimited). */
  remaining: number;
}

export async function getStudentCapacity(
  prisma: PrismaClient,
  schoolId: string,
): Promise<StudentCapacity> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { plan: true },
  });
  const { studentLimit } = planConfig(school?.plan ?? 'CROISSANCE');
  if (studentLimit === null) {
    return { limit: null, current: 0, remaining: Infinity };
  }
  const current = await prisma.student.count({ where: { schoolId } });
  return { limit: studentLimit, current, remaining: Math.max(0, studentLimit - current) };
}

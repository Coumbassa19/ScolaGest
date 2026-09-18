import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getStudentCapacity } from './plan-limits';

function makePrismaMock(plan: string | null, studentCount: number) {
  return {
    school: { findUnique: vi.fn().mockResolvedValue(plan ? { plan } : null) },
    student: { count: vi.fn().mockResolvedValue(studentCount) },
  } as unknown as PrismaClient;
}

describe('getStudentCapacity', () => {
  it('returns the 700-student cap and remaining seats for an ESSENTIEL school', async () => {
    const prisma = makePrismaMock('ESSENTIEL', 650);
    const capacity = await getStudentCapacity(prisma, 'school-1');
    expect(capacity).toEqual({ limit: 700, current: 650, remaining: 50 });
  });

  it('returns remaining:0 (never negative) once an ESSENTIEL school is at or over its cap', async () => {
    const prisma = makePrismaMock('ESSENTIEL', 700);
    const capacity = await getStudentCapacity(prisma, 'school-1');
    expect(capacity.remaining).toBe(0);

    const overCap = makePrismaMock('ESSENTIEL', 705);
    const capacityOver = await getStudentCapacity(overCap, 'school-1');
    expect(capacityOver.remaining).toBe(0);
  });

  it('is unlimited for a CROISSANCE school and never counts students', async () => {
    const prisma = makePrismaMock('CROISSANCE', 5000);
    const capacity = await getStudentCapacity(prisma, 'school-1');
    expect(capacity).toEqual({ limit: null, current: 0, remaining: Infinity });
    expect((prisma.student.count as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('defaults to unlimited (CROISSANCE) when the school or its plan is missing/invalid', async () => {
    const prisma = makePrismaMock(null, 0);
    const capacity = await getStudentCapacity(prisma, 'missing-school');
    expect(capacity).toEqual({ limit: null, current: 0, remaining: Infinity });
  });
});

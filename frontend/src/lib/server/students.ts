import 'server-only';
import type { PrismaClient } from '@prisma/client';

// Shared by POST /api/students (single enrollment) and
// POST /api/students/import (bulk Excel import) — both need to auto-generate
// a matricule (ELE-<year>-<seq>) when the caller doesn't supply one. Takes
// the caller's already schoolId-scoped Prisma client (see prisma.ts) —
// `Student` is tenant-scoped, so this must never use the unscoped default
// client.
//
// Based on the highest existing sequence number, not a raw count — a
// count-based scheme silently collides with an existing matricule as soon
// as any student in the year has ever been deleted (count drops but the
// gap in the sequence doesn't), which repeatedly failed real enrollments.
export async function nextMatricule(prisma: PrismaClient, anneeScolaire: string): Promise<string> {
  const year = anneeScolaire.slice(0, 4) || String(new Date().getFullYear());
  const prefix = `ELE-${year}-`;
  const last = await prisma.student.findFirst({
    where: { anneeScolaire, matricule: { startsWith: prefix } },
    orderBy: { matricule: 'desc' },
    select: { matricule: true },
  });
  const lastSeq = last ? Number(last.matricule.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
}

import 'server-only';
import { prisma } from '@/lib/server/prisma';

// Shared by POST /api/students (single enrollment) and
// POST /api/students/import (bulk Excel import) — both need to auto-generate
// a matricule (ELE-<year>-<seq>) when the caller doesn't supply one.
export async function nextMatricule(anneeScolaire: string): Promise<string> {
  const year = anneeScolaire.slice(0, 4) || String(new Date().getFullYear());
  const count = await prisma.student.count({ where: { anneeScolaire } });
  return `ELE-${year}-${String(count + 1).padStart(3, '0')}`;
}

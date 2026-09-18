// One-off backfill. Converts the existing free-text class list on each
// Subject (Subject.teacherId + Subject.classesText, e.g. "5ème A, 5ème B")
// into real TeacherAssignment rows (teacherId × subjectId × classId) — the
// new relational source of truth used by requireStaff/teacher-scope.ts for
// TEACHER-role security scoping.
//
// Usage: pnpm db:backfill-teacher-assignments
//
// Idempotent — the (teacherId, subjectId, classId) unique constraint means
// running it twice just skips rows that already exist (P2002 caught and
// counted as "already existed", not an error).
//
// Subject.classesText is free text typed by hand (no strict format enforced
// anywhere in the app), so a class name that doesn't exactly match an
// existing SchoolClass.name is logged as unmatched rather than guessed at
// or silently dropped — small numbers of teachers/subjects today make a
// manual fixup via /settings/users entirely realistic. Teacher.classesAssignees
// is NOT used as a source here: it's a looser, teacher-level free-text field
// with no per-subject breakdown, while Subject.teacherId + classesText
// already gives the exact (teacher, subject, classes) triple this script
// needs.

import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

interface RunDeps {
  // Injectable for tests — defaults to the lazy-instantiated PrismaClient
  // when called as a CLI.
  prisma?: Pick<PrismaClient, 'subject' | 'schoolClass' | 'teacherAssignment' | '$disconnect'>;
}

export interface BackfillResult {
  created: number;
  alreadyExisted: number;
  unmatched: { subjectNom: string; teacherNom: string; className: string }[];
}

export async function main(deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const [subjects, classes] = await Promise.all([
      prisma.subject.findMany({
        where: { teacherId: { not: null } },
        include: { teacher: true },
      }),
      prisma.schoolClass.findMany({ select: { id: true, name: true } }),
    ]);

    const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c]));

    const result: BackfillResult = { created: 0, alreadyExisted: 0, unmatched: [] };

    for (const subject of subjects) {
      if (!subject.teacherId || !subject.classesText) continue;
      const names = subject.classesText
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);

      for (const name of names) {
        const match = classByName.get(name.toLowerCase());
        if (!match) {
          result.unmatched.push({
            subjectNom: subject.nom,
            teacherNom: subject.teacher ? `${subject.teacher.nom} ${subject.teacher.prenom}` : '?',
            className: name,
          });
          continue;
        }
        try {
          await prisma.teacherAssignment.create({
            data: { teacherId: subject.teacherId, subjectId: subject.id, classId: match.id },
          });
          result.created++;
        } catch (err) {
          const isUniqueClash =
            typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
          if (isUniqueClash) {
            result.alreadyExisted++;
          } else {
            throw err;
          }
        }
      }
    }

    console.log(`✓ Created ${result.created} TeacherAssignment row(s).`);
    if (result.alreadyExisted > 0) {
      console.log(`  (${result.alreadyExisted} already existed — skipped.)`);
    }
    if (result.unmatched.length > 0) {
      console.warn(`⚠ ${result.unmatched.length} class name(s) could not be matched:`);
      for (const u of result.unmatched) {
        console.warn(`  - "${u.className}" (subject "${u.subjectNom}", teacher ${u.teacherNom})`);
      }
      console.warn('  Fix these manually via /settings/users once the admin UI exists.');
    }

    return 0;
  } finally {
    if (!deps.prisma && prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

// Windows-safe entrypoint check: import.meta.url is a file:// URL with
// forward slashes (file:///C:/...) while process.argv[1] is an OS path
// (C:\...) — a plain string comparison silently never matches on Windows,
// so both sides are normalized through pathToFileURL first.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

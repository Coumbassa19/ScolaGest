// One-off backfill for the "Cycles scolaires" feature (Primaire /
// Secondaire / Universitaire, each with its own grading scale). Run once
// after the migration that adds Cycle + SchoolClass.cycleId (nullable).
//
// Usage: pnpm db:backfill-cycles
//
// For every School: creates the 3 default cycles (Primaire /10, Secondaire
// /20, Universitaire /10) if they don't already exist, then assigns every
// class that has no cycle yet to "Secondaire" — this preserves today's
// behaviour exactly (every existing grade was already validated 0-20), with
// zero data invalidated. The school admin can reassign specific classes to
// Primaire/Universitaire afterward via the new /cycles and /classes UI.
//
// Idempotent — safe to re-run: cycles are looked up by (schoolId, name)
// before creating, and only classes with cycleId === null are touched.

import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

const DEFAULT_CYCLES = [
  { name: 'Primaire', noteMax: 10, order: 1 },
  { name: 'Secondaire', noteMax: 20, order: 2 },
  { name: 'Universitaire', noteMax: 10, order: 3 },
] as const;

interface RunDeps {
  // Injectable for tests — defaults to the lazy-instantiated PrismaClient
  // when called as a CLI.
  prisma?: Pick<PrismaClient, 'school' | 'cycle' | 'schoolClass' | '$disconnect'>;
}

export interface BackfillResult {
  schoolsProcessed: number;
  cyclesCreated: number;
  classesAssigned: number;
}

export async function main(deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const schools = await prisma.school.findMany({ select: { id: true } });
    const result: BackfillResult = { schoolsProcessed: 0, cyclesCreated: 0, classesAssigned: 0 };

    for (const school of schools) {
      const existing = await prisma.cycle.findMany({
        where: { schoolId: school.id },
        select: { id: true, name: true },
      });
      const byName = new Map(existing.map((c) => [c.name, c]));

      for (const def of DEFAULT_CYCLES) {
        if (byName.has(def.name)) continue;
        const created = await prisma.cycle.create({
          data: { schoolId: school.id, name: def.name, noteMax: def.noteMax, order: def.order },
        });
        byName.set(def.name, created);
        result.cyclesCreated++;
      }

      const secondaire = byName.get('Secondaire');
      if (secondaire) {
        const { count } = await prisma.schoolClass.updateMany({
          where: { schoolId: school.id, cycleId: null },
          data: { cycleId: secondaire.id },
        });
        result.classesAssigned += count;
      }

      result.schoolsProcessed++;
    }

    console.log(`✓ Processed ${result.schoolsProcessed} school(s).`);
    console.log(`  ${result.cyclesCreated} cycle(s) created.`);
    console.log(`  ${result.classesAssigned} class(es) assigned to "Secondaire".`);

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

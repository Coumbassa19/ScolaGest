// One-off backfill for the multi-tenant migration. The app was single-tenant
// until now — every existing row (Student, Teacher, Grade, User, …) belongs
// implicitly to "the one school." This script:
//   1. Creates exactly one `School` row representing that existing school
//      (idempotent — if a School already exists, reuses the first one
//      instead of creating a second).
//   2. Assigns its id to every existing row (across User + the 15 school-
//      domain models) that still has `schoolId = null`.
//
// The backfilled School is marked ACTIVE with a `currentPeriodEnd` 10 years
// out rather than TRIALING — this is the founder's own real, already-
// operating school, not a new trial signup, and should never be blocked by
// the subscription gate introduced alongside it.
//
// Usage: pnpm db:backfill-schools
//
// Idempotent — safe to re-run: `updateMany({ where: { schoolId: null } })`
// only touches rows not yet assigned.

import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { slugify } from '../src/lib/server/school-slug';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

interface RunDeps {
  prisma?: PrismaClient;
}

export interface BackfillResult {
  schoolId: string;
  schoolCreated: boolean;
  updatedCounts: Record<string, number>;
}

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export async function main(deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    let school = await prisma.school.findFirst({ orderBy: { createdAt: 'asc' } });
    let schoolCreated = false;

    if (!school) {
      const settings = await prisma.schoolSettings.findFirst();
      const name = settings?.name ?? 'École principale';
      const baseSlug = slugify(name);
      let slug = baseSlug;
      let suffix = 1;
      // Extremely unlikely collision (first School ever created) but keep
      // the slug unique defensively rather than letting create() throw.
      while (await prisma.school.findUnique({ where: { slug } })) {
        suffix++;
        slug = `${baseSlug}-${suffix}`;
      }

      school = await prisma.school.create({
        data: {
          name,
          slug,
          status: 'ACTIVE',
          trialEndsAt: new Date(),
          currentPeriodEnd: new Date(Date.now() + TEN_YEARS_MS),
        },
      });
      schoolCreated = true;
    }

    const schoolId = school.id;
    const updatedCounts: Record<string, number> = {};

    const models: { key: string; update: () => Promise<{ count: number }> }[] = [
      { key: 'User', update: () => prisma.user.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'SchoolClass', update: () => prisma.schoolClass.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'AcademicYear', update: () => prisma.academicYear.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'Student', update: () => prisma.student.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'Absence', update: () => prisma.absence.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'SchoolMessage', update: () => prisma.schoolMessage.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'BulletinRemark', update: () => prisma.bulletinRemark.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'Teacher', update: () => prisma.teacher.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'TeacherPayment', update: () => prisma.teacherPayment.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'TuitionPlan', update: () => prisma.tuitionPlan.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'Subject', update: () => prisma.subject.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'TeacherAssignment', update: () => prisma.teacherAssignment.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'Grade', update: () => prisma.grade.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'ScheduleEntry', update: () => prisma.scheduleEntry.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'RevenuePayment', update: () => prisma.revenuePayment.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
      { key: 'SchoolSettings', update: () => prisma.schoolSettings.updateMany({ where: { schoolId: null }, data: { schoolId } }) },
    ];

    for (const m of models) {
      const res = await m.update();
      updatedCounts[m.key] = res.count;
    }

    console.log(
      schoolCreated
        ? `✓ Created School "${school.name}" (${school.id}, slug "${school.slug}").`
        : `✓ Reusing existing School "${school.name}" (${school.id}).`,
    );
    for (const [key, count] of Object.entries(updatedCounts)) {
      console.log(`  ${key}: ${count} row(s) assigned.`);
    }

    return 0;
  } finally {
    if (!deps.prisma && prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

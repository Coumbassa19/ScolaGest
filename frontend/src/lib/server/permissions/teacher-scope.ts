// Server-side ground truth for "what is THIS teacher allowed to see/grade" —
// backed by the TeacherAssignment relation (never the free-text
// Teacher.classesAssignees / Subject.classesText, which aren't queryable
// and aren't trusted for access control). Used by every route/page that
// needs to restrict a TEACHER-role user to their own subjects/classes.
//
// Every function here takes the caller's schoolId-scoped Prisma client
// (`auth.user.prisma` from requireStaff/requirePageAuth) as its first
// argument — see the header comment in `../prisma.ts` for why tenant
// scoping is threaded explicitly rather than resolved ambiently.
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

export async function getTeacherClassIds(prisma: Tx, teacherId: string): Promise<string[]> {
  const rows = await prisma.teacherAssignment.findMany({
    where: { teacherId },
    select: { classId: true },
    distinct: ['classId'],
  });
  return rows.map((r) => r.classId);
}

export async function getTeacherSubjectIds(prisma: Tx, teacherId: string): Promise<string[]> {
  const rows = await prisma.teacherAssignment.findMany({
    where: { teacherId },
    select: { subjectId: true },
    distinct: ['subjectId'],
  });
  return rows.map((r) => r.subjectId);
}

/**
 * True iff this teacher is assigned to teach exactly this subject in
 * exactly this class — the pairing matters: a teacher assigned to
 * (Math, 5èmeA) and (English, 5èmeB) is NOT thereby allowed to enter
 * English grades for 5èmeA. This is the hard boundary POST /api/grades
 * checks, independent of whatever the UI's dropdowns happened to allow.
 */
export async function assertTeacherAssignment(
  prisma: Tx,
  teacherId: string,
  classId: string,
  subjectId: string,
): Promise<boolean> {
  const row = await prisma.teacherAssignment.findUnique({
    where: { teacherId_subjectId_classId: { teacherId, subjectId, classId } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Keeps TeacherAssignment (the real security ground truth) derived live from
 * a single Subject's `teacherId` + `classesText` (the free-text fields the
 * existing add-subject/edit-subject UI already writes to). Call this after
 * every Subject create/update/delete so TEACHER-role scoping never drifts
 * out of sync with what the admin actually set on the subject — without
 * this, `scripts/backfill-teacher-assignments.ts` would only ever be
 * correct for the instant it ran.
 *
 * Replace-all-for-this-subject rather than diff: simplest correct approach
 * given a subject has at most a handful of classes, and this runs on every
 * write, not in a hot path.
 *
 * `tx` must be a transaction client obtained from the caller's own
 * schoolId-scoped `prisma.$transaction(...)` (i.e. `auth.user.prisma`) so
 * `schoolId` still gets auto-injected on the `create` below.
 */
export async function syncSubjectTeacherAssignments(
  tx: Tx,
  schoolId: string,
  subjectId: string,
): Promise<{ unmatched: string[] }> {
  const subject = await tx.subject.findUnique({
    where: { id: subjectId },
    select: { teacherId: true, classesText: true },
  });

  await tx.teacherAssignment.deleteMany({ where: { subjectId } });

  if (!subject?.teacherId || !subject.classesText) {
    return { unmatched: [] };
  }

  const names = subject.classesText
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) return { unmatched: [] };

  const classes = await tx.schoolClass.findMany({ select: { id: true, name: true } });
  const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c]));

  const unmatched: string[] = [];
  for (const name of names) {
    const match = classByName.get(name.toLowerCase());
    if (!match) {
      unmatched.push(name);
      continue;
    }
    await tx.teacherAssignment.create({
      data: { schoolId, teacherId: subject.teacherId, subjectId, classId: match.id },
    });
  }
  return { unmatched };
}

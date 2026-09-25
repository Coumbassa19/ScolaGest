// GET  /api/grades?classId=&periode= — list grades (with student + subject)
//      for a class/period — used by /grades and /bulletin. Also returns
//      `submissions` (see GradeSubmission below) for the same scope, so a
//      client can tell which class/subject/period batches are locked. Each
//      grade row also carries `type`/`label` (DEVOIR/COMPOSITION — see
//      src/lib/server/grades/moyenne.ts) since a subject's trimester grade
//      is now the blend of several such rows, not a single value.
// POST /api/grades — bulk-save grades for one class/subject/period/year/
//      type/label batch (the enter-grades form saves one row per student
//      at once, for one Devoir round or the Composition). Upserts on the
//      (studentId, subjectId, periode, anneeScolaire, type, label) unique
//      constraint so re-saving the same batch corrects rather than
//      duplicates, while a different Devoir round or a different year
//      stays a separate row.
//
// TEACHER-role scoping: a teacher may only read/write grades for a
// (class, subject) pair they're actually assigned to (TeacherAssignment).
// GET narrows rather than rejects when no classId/subjectId filter is
// given (so a broader query — e.g. by studentId only — still only returns
// what this teacher is allowed to see), but rejects an explicit classId
// outside their assignments. POST always rejects a (classId, subjectId)
// pair the teacher isn't assigned to — that's the hard boundary that
// survives a crafted request regardless of what the UI ever renders.
//
// Anti-corruption lock (GradeSubmission): once a TEACHER saves grades for a
// given (classId, subjectId, periode, anneeScolaire, type, label) batch, it
// is locked — a further POST from that same TEACHER role for that exact
// batch is rejected outright (GRADES_ALREADY_VALIDATED), regardless of who
// originally submitted it. Each Devoir round and the Composition lock
// independently: a teacher can freely add "Devoir 2" even while "Devoir 1"
// is already locked. The paper grade sheet itself is the proof: a teacher
// who needs a correction brings it in person to the direction (no digital
// photo is captured — a class roster commonly spans several physical
// sheets, which a single mandatory upload can't represent anyway).
// DIRECTION/ADMIN/SUPERADMIN (and STAFF granted the 'grades' menu) are
// never blocked by the lock and can always correct a batch; doing so
// records correctedById/correctedAt (and an optional correctionNote) on
// the GradeSubmission row as an audit trail, without disturbing who
// originally submitted it.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { requireSchoolId } from '@/lib/server/tenant/context';
import { zCuid } from '@/lib/server/zod-helpers';
import {
  getTeacherClassIds,
  getTeacherSubjectIds,
  assertTeacherAssignment,
} from '@/lib/server/permissions/teacher-scope';

const Body = z.object({
  classId: zCuid,
  subjectId: zCuid,
  periode: z.enum(['T1', 'T2', 'T3']).default('T1'),
  anneeScolaire: z.string().trim().min(1).max(20).default('2024-2025'),
  type: z.enum(['DEVOIR', 'COMPOSITION']).default('COMPOSITION'),
  // Free text ("Devoir 1", "Devoir 2"...). Ignored and forced server-side
  // to "Composition" when type=COMPOSITION (see below) — never trust a
  // client-supplied label for that case, since computeMoyenneMatiere
  // assumes at most one COMPOSITION row per (student, subject, periode,
  // anneeScolaire).
  label: z.string().trim().min(1).max(60).default('Composition'),
  entries: z
    .array(
      z.object({
        studentId: zCuid,
        // Decimal grades (e.g. 14.5) are allowed — rounded to 1 decimal
        // below before storage. Upper bound is enforced imperatively
        // further down, against the target class's cycle noteMax (10, 20,
        // ...) — not a fixed literal here, since the max varies per cycle.
        // 1000 is just a sane absolute ceiling against garbage input.
        valeur: z.number().min(0).max(1000),
      }),
    )
    .min(1)
    .max(200),
  // Only meaningful when correcting an already-submitted batch.
  correctionNote: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'grades' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId') || undefined;
    const periode = searchParams.get('periode') || undefined;
    const studentId = searchParams.get('studentId') || undefined;
    const anneeScolaire = searchParams.get('anneeScolaire') || undefined;

    let teacherClassIds: string[] | undefined;
    let teacherSubjectIds: string[] | undefined;
    if (auth.user.role === 'TEACHER') {
      if (!auth.user.teacherId) {
        return NextResponse.json(
          { error: 'TEACHER_NOT_LINKED', message: 'No teacher record linked to this account' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      [teacherClassIds, teacherSubjectIds] = await Promise.all([
        getTeacherClassIds(prisma, auth.user.teacherId),
        getTeacherSubjectIds(prisma, auth.user.teacherId),
      ]);
      if (classId && !teacherClassIds.includes(classId)) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Not your class' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const [grades, submissions] = await Promise.all([
      prisma.grade.findMany({
        where: {
          ...(classId ? { classId } : teacherClassIds ? { classId: { in: teacherClassIds } } : {}),
          ...(periode ? { periode } : {}),
          ...(studentId ? { studentId } : {}),
          ...(anneeScolaire ? { anneeScolaire } : {}),
          ...(teacherSubjectIds ? { subjectId: { in: teacherSubjectIds } } : {}),
        },
        include: { student: true, subject: true },
        orderBy: [{ subject: { nom: 'asc' } }],
      }),
      // Lock status for the same scope — lets a client (EnterGradesForm)
      // tell which class/subject/period batches are already validated,
      // without a second round trip. Not filtered by studentId: a
      // submission is a batch-level record, unrelated to a single student.
      prisma.gradeSubmission.findMany({
        where: {
          ...(classId ? { classId } : teacherClassIds ? { classId: { in: teacherClassIds } } : {}),
          ...(periode ? { periode } : {}),
          ...(anneeScolaire ? { anneeScolaire } : {}),
          ...(teacherSubjectIds ? { subjectId: { in: teacherSubjectIds } } : {}),
        },
        select: {
          id: true,
          classId: true,
          subjectId: true,
          periode: true,
          anneeScolaire: true,
          type: true,
          label: true,
          submittedAt: true,
          submittedBy: { select: { name: true, email: true } },
          correctedAt: true,
        },
      }),
    ]);
    return NextResponse.json(
      { grades, submissions },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'grades' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { classId, subjectId, periode, anneeScolaire, type } = parsed.data;
    // Hard invariant, not a nicety: computeMoyenneMatiere assumes at most
    // one COMPOSITION row per (student, subject, periode, anneeScolaire) —
    // never trust a client-supplied label for that case.
    const label = type === 'COMPOSITION' ? 'Composition' : parsed.data.label;
    // Round to 1 decimal at the trust boundary — grades allow a single
    // decimal digit (14.5, not 14.52) — whatever precision a client sends,
    // the stored/displayed grade is always clean.
    const entries = parsed.data.entries.map((e) => ({
      ...e,
      valeur: Math.round(e.valeur * 10) / 10,
    }));

    const [schoolClass, subject] = await Promise.all([
      prisma.schoolClass.findUnique({ where: { id: classId }, include: { cycle: true } }),
      prisma.subject.findUnique({ where: { id: subjectId } }),
    ]);
    if (!schoolClass || !subject) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Classe ou matière introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const noteMax = schoolClass.cycle.noteMax;
    const outOfRange = entries.find((e) => e.valeur > noteMax);
    if (outOfRange) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: `Les notes de cette classe doivent être comprises entre 0 et ${noteMax} (cycle ${schoolClass.cycle.name}).`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (auth.user.role === 'TEACHER') {
      if (!auth.user.teacherId) {
        return NextResponse.json(
          { error: 'TEACHER_NOT_LINKED', message: 'No teacher record linked to this account' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const allowed = await assertTeacherAssignment(
        prisma,
        auth.user.teacherId,
        classId,
        subjectId,
      );
      if (!allowed) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'You are not assigned to this class/subject' },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const existingSubmission = await prisma.gradeSubmission.findUnique({
      where: {
        classId_subjectId_periode_anneeScolaire_type_label: {
          classId,
          subjectId,
          periode,
          anneeScolaire,
          type,
          label,
        },
      },
    });

    if (auth.user.role === 'TEACHER') {
      if (existingSubmission) {
        return NextResponse.json(
          {
            error: 'GRADES_ALREADY_VALIDATED',
            message: 'These grades were already validated. See the direction to correct them.',
          },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const grades = await prisma.$transaction(
      entries.map((entry) =>
        prisma.grade.upsert({
          where: {
            studentId_subjectId_periode_anneeScolaire_type_label: {
              studentId: entry.studentId,
              subjectId,
              periode,
              anneeScolaire,
              type,
              label,
            },
          },
          update: { valeur: entry.valeur, classId },
          create: {
            schoolId: requireSchoolId(auth.user.schoolId),
            studentId: entry.studentId,
            subjectId,
            classId,
            periode,
            anneeScolaire,
            type,
            label,
            valeur: entry.valeur,
          },
        }),
      ),
    );

    // Lock/audit-trail record for this batch — see the module header. A
    // TEACHER only ever reaches this line on a first-ever save (a repeat
    // was already rejected above), so `existingSubmission` here only
    // happens for a DIRECTION/ADMIN/STAFF correction.
    const submission = await prisma.gradeSubmission.upsert({
      where: {
        classId_subjectId_periode_anneeScolaire_type_label: {
          classId,
          subjectId,
          periode,
          anneeScolaire,
          type,
          label,
        },
      },
      create: {
        schoolId: requireSchoolId(auth.user.schoolId),
        classId,
        subjectId,
        periode,
        anneeScolaire,
        type,
        label,
        submittedById: auth.user.sub,
      },
      update: existingSubmission
        ? {
            correctedById: auth.user.sub,
            correctedAt: new Date(),
            ...(parsed.data.correctionNote ? { correctionNote: parsed.data.correctionNote } : {}),
          }
        : {},
    });

    return NextResponse.json(
      { grades, count: grades.length, submission },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

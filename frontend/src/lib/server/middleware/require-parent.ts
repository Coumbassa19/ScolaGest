/**
 * requireParent / requireParentPage — the PARENT-portal counterpart to
 * requireStaff / requirePageAuth. Deliberately NOT built on top of
 * effectiveMenus/MENU_KEYS: a parent's access isn't "which sidebar sections
 * are enabled", it's "which specific students (via ParentStudent) can this
 * account see" — a completely different, much narrower shape than the
 * staff menu system, so it gets its own small auth path instead of forcing
 * PARENT into the staff vocabulary.
 *
 * Both resolve `studentIds` (via ParentStudent — the security ground truth,
 * same role TeacherAssignment plays for a TEACHER's own scope, see
 * teacher-scope.ts) so callers can immediately scope any query by student
 * without a second round-trip. Any route/page reading parent-visible data
 * MUST filter by `studentIds`, never trust a client-supplied studentId
 * alone — see e.g. /api/parent/grades.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PrismaClient } from '@prisma/client';
import { requireAuth } from './index';
import { verifyToken, COOKIE_NAME } from '../auth';
import { prisma, scopedPrisma } from '../prisma';
import { isSchoolAccessBlocked } from '../tenant/billing-gate';

export interface ParentContext {
  user: {
    sub: string;
    email: string;
    schoolId: string;
    prisma: PrismaClient;
    studentIds: string[];
  };
}

async function resolveParentStudentIds(
  schoolPrisma: PrismaClient,
  parentUserId: string,
): Promise<string[]> {
  const links = await schoolPrisma.parentStudent.findMany({
    where: { parentUserId },
    select: { studentId: true },
  });
  return links.map((l) => l.studentId);
}

export async function requireParent(
  authHeader?: string | null,
): Promise<ParentContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: { id: true, email: true, role: true, status: true, schoolId: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 401 });
  }
  if (user.status === 'SUSPENDED') {
    return NextResponse.json(
      { error: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended.' },
      { status: 403 },
    );
  }
  if (user.role !== 'PARENT' || !user.schoolId) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'This account has no parent-portal access.' },
      { status: 403 },
    );
  }

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
  });
  if (school && isSchoolAccessBlocked(school)) {
    return NextResponse.json(
      { error: 'SUBSCRIPTION_REQUIRED', message: 'This school’s trial or subscription has ended.' },
      { status: 402 },
    );
  }

  const schoolPrisma = scopedPrisma(user.schoolId);
  const studentIds = await resolveParentStudentIds(schoolPrisma, user.id);

  return {
    user: {
      sub: user.id,
      email: user.email,
      schoolId: user.schoolId,
      prisma: schoolPrisma,
      studentIds,
    },
  };
}

export async function requireParentPage(): Promise<ParentContext> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) redirect('/login');

  const payload = await verifyToken(token);
  if (!payload) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      schoolId: true,
      tokenVersion: true,
    },
  });
  if (!user) redirect('/login');
  if (user.tokenVersion !== (payload.tokenVersion ?? 0)) redirect('/login');
  if (user.status === 'SUSPENDED') redirect('/login');
  if (user.role !== 'PARENT' || !user.schoolId) redirect('/403');

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
  });
  if (school && isSchoolAccessBlocked(school)) redirect('/billing');

  const schoolPrisma = scopedPrisma(user.schoolId);
  const studentIds = await resolveParentStudentIds(schoolPrisma, user.id);

  return {
    user: {
      sub: user.id,
      email: user.email,
      schoolId: user.schoolId,
      prisma: schoolPrisma,
      studentIds,
    },
  };
}

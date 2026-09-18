/**
 * requirePageAuth — the Server Component counterpart to requireStaff.
 * Route Handlers can return a NextResponse 4xx; a page component can't, so
 * this redirects instead: unauthenticated → /login, authenticated-but-not-
 * permitted → /403. Same DB-backed role/status/menu check as requireStaff
 * (never trusts the JWT for authorization).
 *
 * Usage — first line of a page component:
 *   const staff = await requirePageAuth({ menuKey: 'grades' });
 *   const prisma = staff.user.prisma; // shadow the top-level import
 *
 * Multi-tenant: `user.prisma` is a schoolId-bound Prisma client (see the
 * header comment in `../prisma.ts` for why this isn't ambient/
 * AsyncLocalStorage-based — that was tried first and proven unreliable in
 * this stack).
 */
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PrismaClient } from '@prisma/client';
import { verifyToken, COOKIE_NAME } from '../auth';
import { prisma, scopedPrisma } from '../prisma';
import { effectiveMenus, type MenuKey } from '../permissions/menu-keys';
import { roleRank, type AdminRole } from './require-admin';
import { isSchoolAccessBlocked } from '../tenant/billing-gate';

export interface StaffPageContext {
  user: {
    sub: string;
    email: string;
    role: string;
    enabledMenus: unknown;
    teacherId: string | null;
    schoolId: string | null;
    prisma: PrismaClient;
  };
}

export async function requirePageAuth(
  opts: { menuKey?: MenuKey; skipBillingGate?: boolean } = {},
): Promise<StaffPageContext> {
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
      enabledMenus: true,
      teacherId: true,
      schoolId: true,
      tokenVersion: true,
    },
  });
  if (!user) redirect('/login');
  if (user.tokenVersion !== (payload.tokenVersion ?? 0)) redirect('/login');
  if (user.status === 'SUSPENDED') redirect('/login');

  if (user.schoolId && !opts.skipBillingGate) {
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
    });
    if (school && isSchoolAccessBlocked(school)) {
      redirect('/billing');
    }
  }

  if (opts.menuKey) {
    const effective = effectiveMenus(user.role, user.enabledMenus);
    if (effective !== null && !effective.includes(opts.menuKey)) {
      redirect('/403');
    }
  }

  return {
    user: {
      sub: user.id,
      email: user.email,
      role: user.role,
      enabledMenus: user.enabledMenus,
      teacherId: user.teacherId,
      schoolId: user.schoolId,
      prisma: user.schoolId ? scopedPrisma(user.schoolId) : prisma,
    },
  };
}

export interface AdminPageContext {
  user: { sub: string; email: string; role: AdminRole; prisma: PrismaClient };
}

/**
 * requireAdminPage — Server Component counterpart to requireAdmin/
 * requireSuperadmin, for the (currently ADMIN-back-office-only)
 * /settings/users pages. Unlike requirePageAuth's menuKey check, this is a
 * ROLE check, not a menu check — DIRECTION/TEACHER always rank 0
 * (see roleRank), so they redirect to /403 regardless of enabledMenus:
 * managing other accounts' access is never something a menu toggle can
 * grant, only an actual ADMIN/SUPERADMIN role.
 */
export async function requireAdminPage(
  minRole: AdminRole = 'ADMIN',
): Promise<AdminPageContext> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) redirect('/login');

  const payload = await verifyToken(token);
  if (!payload) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, role: true, status: true, schoolId: true, tokenVersion: true },
  });
  if (!user) redirect('/login');
  if (user.tokenVersion !== (payload.tokenVersion ?? 0)) redirect('/login');
  if (user.status === 'SUSPENDED') redirect('/login');

  const role = (user.role as AdminRole) ?? 'USER';
  if (roleRank(role) < roleRank(minRole)) redirect('/403');

  if (user.schoolId) {
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
    });
    if (school && isSchoolAccessBlocked(school)) redirect('/billing');
  }

  return {
    user: {
      sub: user.id,
      email: user.email,
      role,
      prisma: user.schoolId ? scopedPrisma(user.schoolId) : prisma,
    },
  };
}

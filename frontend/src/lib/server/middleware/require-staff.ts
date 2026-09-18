/**
 * requireStaff — the ScolaGest-domain counterpart to requireAdmin. Chains
 * requireAuth(), then re-reads role/status/enabledMenus/teacherId/schoolId
 * from the DB on every call (same "never trust the JWT for authorization"
 * pattern requireAdmin already uses — the JWT payload carries no role at
 * all).
 *
 * ADMIN/SUPERADMIN always pass the menu check (they're the back-office
 * roles and see everything). DIRECTION/TEACHER pass only if `menuKey` (when
 * given) is in their effective menu set (see menu-keys.ts). A plain USER
 * (legacy self-signup) or SUSPENDED account never passes.
 *
 * Multi-tenant: also resolves `user.schoolId` and returns a schoolId-bound
 * Prisma client as `user.prisma` (see the header comment in
 * `../prisma.ts` for why this isn't ambient/AsyncLocalStorage-based).
 * Callers MUST shadow the top-level `prisma` import with it:
 *
 *   const auth = await requireStaff({ menuKey: 'students' });
 *   if (auth instanceof NextResponse) return auth;
 *   const prisma = auth.user.prisma;
 *
 * A school whose trial or paid period has lapsed is blocked here too
 * (except the billing routes themselves), before any menu check.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { requireAuth } from './index';
import { prisma, scopedPrisma } from '../prisma';
import { effectiveMenus, type MenuKey } from '../permissions/menu-keys';
import { isSchoolAccessBlocked } from '../tenant/billing-gate';

export interface StaffContext {
  user: {
    sub: string;
    email: string;
    role: string;
    enabledMenus: unknown;
    teacherId: string | null;
    schoolId: string | null;
    /** Schoolid-bound Prisma client — shadow the top-level import with this. */
    prisma: PrismaClient;
  };
}

export async function requireStaff(
  opts: { menuKey?: MenuKey; skipBillingGate?: boolean } = {},
  authHeader?: string | null,
): Promise<StaffContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      enabledMenus: true,
      teacherId: true,
      schoolId: true,
    },
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

  if (user.schoolId && !opts.skipBillingGate) {
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
  }

  if (opts.menuKey) {
    const effective = effectiveMenus(user.role, user.enabledMenus);
    if (effective !== null && !effective.includes(opts.menuKey)) {
      return NextResponse.json(
        { error: 'MENU_NOT_ENABLED', message: 'You do not have access to this section.' },
        { status: 403 },
      );
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

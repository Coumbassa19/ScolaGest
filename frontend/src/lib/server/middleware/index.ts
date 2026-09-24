/**
 * Higher-order helpers callable from Next.js route handlers. Each one
 * either:
 *   - returns a NextResponse 4xx to short-circuit the handler, OR
 *   - returns the resolved auth context the handler needs.
 *
 * Example:
 *   export async function POST(req: NextRequest) {
 *     const csrfFail = verifyCsrf(req);
 *     if (csrfFail) return csrfFail;
 *     const auth = await requireAuth();
 *     if (auth instanceof NextResponse) return auth;
 *     // …handler logic with `auth.user.sub`
 *   }
 *
 * Why not Express-style middleware chains? Next.js route handlers are
 * plain functions; HOFs compose more naturally and keep the type of
 * `req`/`ctx` standard.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '../auth';
import { prisma, scopedPrisma } from '../prisma';
import type { PrismaClient } from '@prisma/client';
import type { AdminRole } from './require-admin';
import { roleRank } from './require-admin';
import type { OrgRole } from './require-org-role';
import { ORG_ROLE_RANK } from './require-org-role';
import { isSchoolAccessBlocked } from '../tenant/billing-gate';

export interface AuthContext {
  user: { sub: string; email: string };
}

export interface AdminContext extends AuthContext {
  admin: { id: string; email: string; role: AdminRole; prisma: PrismaClient };
}

export interface OrgContext extends AuthContext {
  orgMember: { organizationId: string; userId: string; role: OrgRole };
}

/**
 * Resolve the authenticated user from the cookie / Bearer header. Returns
 * `AuthContext` on success, or a 401 NextResponse on failure.
 *
 * The DB re-query blocks stale-JWT bypass (deleted accounts, bumped
 * tokenVersion).
 */
export async function requireAuth(authHeader?: string | null): Promise<AuthContext | NextResponse> {
  const store = await cookies();
  let token = store.get(COOKIE_NAME)?.value;

  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  }
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const payloadVersion = payload.tokenVersion ?? 0;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, tokenVersion: true, status: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 401 });
  }
  if (user.tokenVersion !== payloadVersion) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }
  // A suspension mutates User.status directly — without this check a
  // still-valid 15-minute access token would keep working on every route
  // guarded by requireAuth alone until it naturally expired, even though
  // login/refresh already refuse SUSPENDED accounts. Closes that window.
  if (user.status === 'SUSPENDED') {
    return NextResponse.json(
      { error: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended.' },
      { status: 403 },
    );
  }
  return { user: { sub: user.id, email: user.email } };
}

/**
 * Soft auth — returns `{ user }` if a valid cookie/Bearer is present,
 * `null` otherwise. Never returns a NextResponse. Use for routes that
 * accept both guests and authenticated callers.
 */
export async function optionalAuth(authHeader?: string | null): Promise<AuthContext | null> {
  const store = await cookies();
  let token = store.get(COOKIE_NAME)?.value;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  }
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const payloadVersion = payload.tokenVersion ?? 0;
  const user = await prisma.user
    .findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, tokenVersion: true, status: true },
    })
    .catch(() => null);
  if (!user || user.tokenVersion !== payloadVersion || user.status === 'SUSPENDED') return null;
  return { user: { sub: user.id, email: user.email } };
}

/**
 * requireAdmin / requireSuperadmin — chain with requireAuth. Re-reads the
 * user role from DB so an in-flight role change is honored on the very
 * next request (no need to wait for the JWT to expire).
 */
export async function requireAdmin(
  minRole: AdminRole = 'ADMIN',
  authHeader?: string | null,
  opts: { skipBillingGate?: boolean } = {},
): Promise<AdminContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: { id: true, email: true, role: true, schoolId: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 401 });
  }
  const role = (user.role as AdminRole) ?? 'USER';
  if (roleRank(role) < roleRank(minRole)) {
    return NextResponse.json(
      { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
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
        {
          error: 'SUBSCRIPTION_REQUIRED',
          message: 'This school’s trial or subscription has ended.',
        },
        { status: 402 },
      );
    }
  }

  const adminPrisma = user.schoolId ? scopedPrisma(user.schoolId) : prisma;
  return {
    user: { sub: user.id, email: user.email },
    admin: { id: user.id, email: user.email, role, prisma: adminPrisma },
  };
}

export async function requireSuperadmin(
  authHeader?: string | null,
): Promise<AdminContext | NextResponse> {
  return requireAdmin('SUPERADMIN', authHeader);
}

export interface SchoolAdminContext extends AuthContext {
  admin: {
    id: string;
    email: string;
    role: AdminRole | 'DIRECTION';
    schoolId: string | null;
    prisma: PrismaClient;
  };
}

/**
 * requireSchoolAdmin — like requireAdmin('ADMIN'), but also accepts a
 * DIRECTION account acting as the owner of their OWN school. DIRECTION
 * carries no platform admin-back-office rank (roleRank always ranks it 0 —
 * see require-admin.ts and the schema.prisma comment on User.role), which is
 * exactly right for the platform-wide /admin/* back office (orders,
 * withdrawals, audit log, other schools' data — reserved to ADMIN/
 * SUPERADMIN only). But a school that subscribes needs full control over
 * ITS OWN accounts (create/edit/suspend teacher & staff logins, adjust their
 * menus) — that's what this grants, scoped to `admin.schoolId`.
 *
 * `User` is deliberately excluded from the tenant-scope Prisma extension
 * (see prisma.ts's TENANT_SCOPED_MODELS comment — login must resolve a user
 * by email before any schoolId is known), so `admin.prisma.user.*` calls are
 * NOT auto-scoped here. Callers touching a specific User row by id MUST
 * compare `target.schoolId === admin.schoolId` themselves whenever
 * `admin.role === 'DIRECTION'` (ADMIN/SUPERADMIN keep today's unrestricted
 * cross-school reach for support purposes).
 */
export async function requireSchoolAdmin(
  authHeader?: string | null,
): Promise<SchoolAdminContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: { id: true, email: true, role: true, schoolId: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 401 });
  }
  const role = user.role;
  if (role !== 'ADMIN' && role !== 'SUPERADMIN' && role !== 'DIRECTION') {
    return NextResponse.json(
      { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
      { status: 403 },
    );
  }

  if (user.schoolId) {
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
    });
    if (school && isSchoolAccessBlocked(school)) {
      return NextResponse.json(
        {
          error: 'SUBSCRIPTION_REQUIRED',
          message: 'This school’s trial or subscription has ended.',
        },
        { status: 402 },
      );
    }
  }

  const adminPrisma = user.schoolId ? scopedPrisma(user.schoolId) : prisma;
  return {
    user: { sub: user.id, email: user.email },
    admin: { id: user.id, email: user.email, role, schoolId: user.schoolId, prisma: adminPrisma },
  };
}

/**
 * requireOrgRole — verifies the authed user belongs to `organizationId`
 * with at least `minRole`. Returns 404 (not 403) for non-members so org
 * existence isn't leaked. Chains requireAuth.
 */
export async function requireOrgRole(
  organizationId: string,
  minRole: OrgRole = 'MEMBER',
  authHeader?: string | null,
): Promise<OrgContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: auth.user.sub } },
    select: { organizationId: true, userId: true, role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  const role = membership.role as OrgRole;
  if (ORG_ROLE_RANK[role] < ORG_ROLE_RANK[minRole]) {
    return NextResponse.json(
      { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
      { status: 403 },
    );
  }
  return {
    user: auth.user,
    orgMember: { organizationId: membership.organizationId, userId: membership.userId, role },
  };
}

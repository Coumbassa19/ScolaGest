// POST /api/schools/signup — self-service school onboarding.
//
// Public route (no requireAuth): a new school owner creates their School +
// their own account in one step, then starts a 14-day free trial with no
// card required. Session cookies are issued immediately, same as
// /api/auth/login, so the redirect straight into /dashboard works.
//
// Role: DIRECTION, not ADMIN. `ADMIN`/`SUPERADMIN` are the PLATFORM
// back-office roles (roleRank > 0) — requireAdmin('ADMIN') gates routes like
// GET/POST /api/admin/users, which queries `prisma.user` UNSCOPED across
// every school on the platform. Handing that role to every self-signup
// school owner would give each of them cross-tenant read/write access to
// every other school's staff accounts the moment they sign up. DIRECTION is
// the correct "full owner of my own school" role — rank 0, gated by
// `enabledMenus`, granted here as every MENU_KEY so the owner starts with
// full access to their own school (same as an admin-created DIRECTION
// account an owner would configure for themselves).
//
// CSRF carve-out: same reasoning as /api/auth/login — no session/CSRF
// cookie exists yet pre-authentication, so verifyCsrf() would 403 every
// legitimate request.
//
// Unlike /api/auth/signup (enumeration-resistant, fakes success for a taken
// email), this route returns a clear 409 EMAIL_TAKEN instead. This is B2B
// school-onboarding UX, not a consumer auth surface — a school owner who
// mistypes or re-submits needs a straight answer, and /api/admin/users
// (also B2B-facing) already returns EMAIL_TAKEN the same way.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAccessToken,
  createRefreshToken,
  hashPassword,
  setAuthCookies,
  setCsrfCookie,
} from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { PASSWORD_MIN, meetsPasswordComplexity } from '@/lib/server/auth/password-policy';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getRedis } from '@/lib/server/redis';
import { prisma } from '@/lib/server/prisma';
import { MENU_KEYS } from '@/lib/server/permissions/menu-keys';
import { PLAN_CROISSANCE, isSchoolPlan } from '@/lib/server/billing/constants';
import { slugify } from '@/lib/server/school-slug';
import { zEmail } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const TRIAL_DAYS = 14;

const SignupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  schoolName: z.string().trim().min(1).max(200),
  email: zEmail,
  password: z.string().min(1),
  // Chosen on the public pricing page and carried via the /signup?plan=
  // link; falls back to CROISSANCE (unlimited) if missing/invalid rather
  // than rejecting the signup outright — see PLANS in billing/constants.ts.
  plan: z.string().optional(),
});

const redis = getRedis() ?? undefined;
const limiter = createEmailLimiter(
  { ...(redis ? { redis } : {}) },
  {
    bucket: 'schools:signup',
    windowMs: 60 * 60 * 1000,
    max: Number(process.env.SCHOOL_SIGNUP_RATE_LIMIT_MAX ?? 5),
    code: 'TOO_MANY_SIGNUP_ATTEMPTS',
    message: 'Too many signup attempts. Try again later.',
  },
);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid JSON body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const parsed = SignupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { name, schoolName, email, password } = parsed.data;
    const plan = isSchoolPlan(parsed.data.plan) ? parsed.data.plan : PLAN_CROISSANCE;

    if (isBanned(password)) {
      return NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (password.length < PASSWORD_MIN) {
      return NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!meetsPasswordComplexity(password)) {
      return NextResponse.json(
        {
          error: 'PASSWORD_TOO_WEAK',
          message: 'Password must include an uppercase letter, a lowercase letter, and a digit.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(password))) {
      return NextResponse.json(
        { error: 'PASSWORD_PWNED', message: 'This password appeared in a known data breach.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rl = await limiter.check(req, email);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json(
        { error: 'EMAIL_TAKEN', message: 'This email address is already used by another account.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const passwordHash = await hashPassword(password);
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const baseSlug = slugify(schoolName);
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.school.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    const { user } = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: schoolName,
          slug,
          status: 'TRIALING',
          plan,
          trialEndsAt,
        },
      });
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          role: 'DIRECTION',
          enabledMenus: [...MENU_KEYS],
          schoolId: school.id,
          emailVerifiedAt: now,
        },
        select: { id: true, email: true, tokenVersion: true },
      });
      return { school, user };
    });

    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(accessToken, refreshToken);
    await setCsrfCookie();

    log.info('school signup', { schoolId: slug });

    return NextResponse.json(
      { ok: true, user: { sub: user.id, email: user.email } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

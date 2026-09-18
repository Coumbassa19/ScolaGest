// GET   /api/auth/me — AUTH-06.
// PATCH /api/auth/me — update the editable profile fields (name, phone,
//       avatarUrl). Added for the /profile page. Deliberately excludes
//       email (identity field, has its own verification flow) and anything
//       auth-sensitive (password, role, status) — those go through their
//       dedicated routes/admin tooling instead.
//
// Source: RESEARCH.md Pattern 14.
//
// requireAuth handles the cookie/Bearer lookup, JWT verification, and the
// DB-side tokenVersion re-check (T-1-02 mitigation against stale-JWT bypass
// after change-password bumps tokenVersion). Returns AuthContext on success
// or a 401 NextResponse on failure.
//
// Extra fields beyond { sub, email } (id, emailVerifiedAt, createdAt,
// updatedAt, hasPassword, linkedProviders, name, phone, avatarUrl) are
// fetched via a second DB hit so the AuthContext / settings / profile pages
// can branch on them without an extra round-trip. `hasPassword`
// distinguishes OAuth-only accounts (passwordHash is null) — used by
// /settings to switch between "Set password" and "Change password".
// `linkedProviders` is a string[] of provider names already wired (e.g.
// ['google']).
//
// No CSRF on GET: it's a safe method; verifyCsrf is a no-op for GET anyway.
// PATCH does need it (see below).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { effectiveMenus } from '@/lib/server/permissions/menu-keys';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    // Defensive shape: tests sometimes stub findUnique with a minimal
    // `{ id, email, tokenVersion }` payload (the requireAuth contract).
    // We only read fields we know are present, and default the rest.
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
        name: true,
        phone: true,
        avatarUrl: true,
        role: true,
        enabledMenus: true,
        oauthAccounts: { select: { provider: true } },
      },
    });

    const user = {
      // Keep `sub` for back-compat with the AuthContext payload contract
      // (older callers may still read it). New code should use `id`.
      sub: auth.user.sub,
      id: dbUser?.id ?? auth.user.sub,
      email: dbUser?.email ?? auth.user.email,
      emailVerifiedAt: dbUser?.emailVerifiedAt
        ? dbUser.emailVerifiedAt instanceof Date
          ? dbUser.emailVerifiedAt.toISOString()
          : dbUser.emailVerifiedAt
        : null,
      createdAt: dbUser?.createdAt
        ? dbUser.createdAt instanceof Date
          ? dbUser.createdAt.toISOString()
          : dbUser.createdAt
        : null,
      updatedAt: dbUser?.updatedAt
        ? dbUser.updatedAt instanceof Date
          ? dbUser.updatedAt.toISOString()
          : dbUser.updatedAt
        : null,
      hasPassword: !!dbUser?.passwordHash,
      linkedProviders: (dbUser?.oauthAccounts ?? []).map((a) => a.provider),
      name: dbUser?.name ?? null,
      phone: dbUser?.phone ?? null,
      avatarUrl: dbUser?.avatarUrl ?? null,
      role: dbUser?.role ?? 'USER',
      // Sidebar filtering (Sidebar.tsx) — null means unrestricted (ADMIN/
      // SUPERADMIN), otherwise the exact list of menu keys this account can
      // reach. This is a UX convenience only; the actual security boundary
      // is requireStaff/requirePageAuth re-checking the same effectiveMenus()
      // server-side on every request, independent of what the sidebar shows.
      menus: dbUser ? effectiveMenus(dbUser.role, dbUser.enabledMenus) : [],
    };

    return NextResponse.json({ user }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}

const PatchBody = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  // Data URL (no Cloudinary configured yet) — capped well above the 500KB
  // client-side limit to leave room for base64 overhead, same convention as
  // Student.photoUrl.
  avatarUrl: z.string().trim().max(700_000).nullable().optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
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
    const data = parsed.data;

    const updated = await prisma.user.update({
      where: { id: auth.user.sub },
      data: {
        ...(data.name !== undefined ? { name: data.name || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl || null } : {}),
      },
      select: { id: true, name: true, phone: true, avatarUrl: true },
    });

    return NextResponse.json(
      { user: updated },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

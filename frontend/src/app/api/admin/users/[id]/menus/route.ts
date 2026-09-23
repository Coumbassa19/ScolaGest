// ADMIN-01 (follow-up) — PATCH /api/admin/users/[id]/menus
//
// Lets an ADMIN/SUPERADMIN change the `enabledMenus` of an EXISTING
// DIRECTION/TEACHER/STAFF account after creation — previously this could
// only be set once, at account-creation time (POST /api/admin/users), with
// no way to grant/revoke a menu (e.g. 'grades') for an account created
// earlier. Same gating as creation (requireAdmin('ADMIN')) and the same
// `enabledMenus` semantics as menu-keys.ts's effectiveMenus(): this is the
// BONUS set on top of the role's core menus, not the full effective list.
//
// Sequence: makeRequestContext → withRequestContext → verifyCsrf →
//   requireAdmin('ADMIN') → enforceAdminRateLimit → Zod parse →
//   prisma.user.update → logAdminAction (action: 'user.menus_change').
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { MENU_KEYS } from '@/lib/server/permissions/menu-keys';

const Body = z.object({
  enabledMenus: z.array(z.enum(MENU_KEYS)),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, enabledMenus: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (target.role === 'ADMIN' || target.role === 'SUPERADMIN') {
      return NextResponse.json(
        {
          error: 'UNRESTRICTED_ROLE',
          message: 'ADMIN/SUPERADMIN accounts already see every menu; nothing to grant.',
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { enabledMenus: parsed.data.enabledMenus },
      select: { id: true, enabledMenus: true },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'user.menus_change',
      targetType: 'User',
      targetId: id,
      metadata: { from: target.enabledMenus, to: parsed.data.enabledMenus },
    });

    return NextResponse.json(
      { user: updated },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

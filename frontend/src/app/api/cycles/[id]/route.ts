// GET    /api/cycles/[id] — single cycle detail (used by the edit page).
// PATCH  /api/cycles/[id] — partial update (name, grading scale, order).
// DELETE /api/cycles/[id] — removes a cycle. SchoolClass.cycleId uses
//       onDelete: Restrict, so deleting a cycle that still has classes
//       assigned to it fails at the DB level (P2003) — surfaced here as a
//       clear error instead of a raw 500.
//       All three verbs are gated to the 'students' menu, same as classes.
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

const Body = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  noteMax: z.number().int().min(1).max(100).optional(),
  order: z.number().int().min(0).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    const cycle = await prisma.cycle.findUnique({ where: { id } });
    if (!cycle) {
      return NextResponse.json(
        { error: 'CYCLE_NOT_FOUND', message: 'Cycle introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json({ cycle }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
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
    const data = parsed.data;

    try {
      const cycle = await prisma.cycle.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.noteMax !== undefined ? { noteMax: data.noteMax } : {}),
          ...(data.order !== undefined ? { order: data.order } : {}),
        },
      });
      return NextResponse.json({ cycle }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : null;
      if (code === 'P2025') {
        return NextResponse.json(
          { error: 'CYCLE_NOT_FOUND', message: 'Cycle introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (code === 'P2002') {
        return NextResponse.json(
          { error: 'CYCLE_ALREADY_EXISTS', message: 'Un cycle porte déjà ce nom' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    try {
      await prisma.cycle.delete({ where: { id } });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : null;
      if (code === 'P2025') {
        return NextResponse.json(
          { error: 'CYCLE_NOT_FOUND', message: 'Cycle introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (code === 'P2003') {
        return NextResponse.json(
          {
            error: 'CYCLE_HAS_CLASSES',
            message: 'Impossible de supprimer un cycle qui a encore des classes rattachées',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

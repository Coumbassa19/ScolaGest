// GET    /api/classes/[id] — single class detail (used by the edit page).
// PATCH  /api/classes/[id] — partial update (name, level).
// DELETE /api/classes/[id] — removes a class. Student.classId uses
//       onDelete: Restrict, so deleting a class that still has students
//       enrolled fails at the DB level (P2003) — surfaced here as a clear
//       error instead of a raw 500. Grade/ScheduleEntry rows for the class
//       cascade-delete automatically.
//       All three verbs are gated to the 'students' menu — same reasoning
//       as GET/POST /api/classes: managing classes is roster administration,
//       not something proven to need cross-menu access.
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
  level: z.number().int().min(0).max(20).optional(),
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
    const schoolClass = await prisma.schoolClass.findUnique({ where: { id } });
    if (!schoolClass) {
      return NextResponse.json(
        { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { class: schoolClass },
      { headers: { 'x-request-id': ctx.requestId } },
    );
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
      const schoolClass = await prisma.schoolClass.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.level !== undefined ? { level: data.level } : {}),
        },
      });
      return NextResponse.json(
        { class: schoolClass },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : null;
      if (code === 'P2025') {
        return NextResponse.json(
          { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (code === 'P2002') {
        return NextResponse.json(
          { error: 'CLASS_ALREADY_EXISTS', message: 'Une classe porte déjà ce nom' },
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
      await prisma.schoolClass.delete({ where: { id } });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : null;
      if (code === 'P2025') {
        return NextResponse.json(
          { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (code === 'P2003') {
        return NextResponse.json(
          {
            error: 'CLASS_HAS_STUDENTS',
            message: 'Impossible de supprimer une classe qui a encore des élèves inscrits',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

// DELETE /api/messages/[id] — remove one row from the "Messages" send
// history (src/app/messages). Admin-only cleanup action: the history is
// otherwise append-only, but the admin may want to clear out test sends or
// stale failed attempts. Does not touch the underlying EmailJob row (kept
// for the cron drain's own bookkeeping) — only the SchoolMessage log entry.
// Gated to the 'messages' menu, same as the rest of the messages surface.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'messages' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id } = await params;
    const existing = await prisma.schoolMessage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'MESSAGE_NOT_FOUND', message: 'Message introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    await prisma.schoolMessage.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}

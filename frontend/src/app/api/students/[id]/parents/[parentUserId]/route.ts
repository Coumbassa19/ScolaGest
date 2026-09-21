// DELETE /api/students/[id]/parents/[parentUserId] — revoke a parent's
// access to this one student (deletes the ParentStudent row only; the
// parent's User login itself is untouched since they may still have other
// children linked — see /api/students/[id]/parents for creation/linking).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; parentUserId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { id: studentId, parentUserId } = await params;
    try {
      await prisma.parentStudent.delete({
        where: { parentUserId_studentId: { parentUserId, studentId } },
      });
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
      if (isNotFound) {
        return NextResponse.json(
          { error: 'LINK_NOT_FOUND', message: 'This parent is not linked to this student.' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

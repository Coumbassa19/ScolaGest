// GET /api/parents/search?q= — find existing PARENT-role accounts at this
// school, for the "link an existing parent to another child" flow on the
// student page (the sibling case: a parent already has a login from an
// older child, and staff just wants to add this one to their access).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    if (q.length < 2) {
      return NextResponse.json({ parents: [] }, { headers: { 'x-request-id': ctx.requestId } });
    }

    // User is deliberately NOT a tenant-scoped model (see the header
    // comment in prisma.ts — login must resolve by email before any school
    // is known), so schoolId must be filtered explicitly here or this would
    // search parent accounts across every school on the platform.
    const parents = await prisma.user.findMany({
      where: {
        role: 'PARENT',
        schoolId: auth.user.schoolId,
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, name: true },
      orderBy: { email: 'asc' },
      take: 10,
    });

    return NextResponse.json({ parents }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

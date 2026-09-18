// POST /api/messages/[id]/resend — retry delivery of one past "Messages"
// history row (src/app/messages), most commonly a FAILED or UNAVAILABLE
// send (mailer was briefly down, a transient provider error). Re-sends the
// exact recipient/subject/body already stored on the row and always
// appends a NEW SchoolMessage row — the history stays an honest,
// append-only record of every attempt, not just the latest one.
// Gated to the 'messages' menu, same as the rest of the messages surface.
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
import { resendSchoolMessage } from '@/lib/server/messages';
import { requireSchoolId } from '@/lib/server/tenant/context';

const Body = z.object({ locale: z.enum(['fr', 'en']).optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'messages' });
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const locale = parsed.success ? parsed.data.locale : undefined;

    try {
      const result = await resendSchoolMessage(
        auth.user.prisma,
        requireSchoolId(auth.user.schoolId),
        id,
        locale ?? 'fr',
      );
      return NextResponse.json({ result }, { headers: { 'x-request-id': ctx.requestId } });
    } catch {
      return NextResponse.json(
        {
          error: 'MESSAGE_NOT_FOUND',
          message: locale === 'en' ? 'Message not found' : 'Message introuvable',
        },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}

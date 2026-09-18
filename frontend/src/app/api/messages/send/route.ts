// POST /api/messages/send — the "Messages" composer (src/app/messages/new)
// sends here: one or more recipients (a student's parent, or a teacher) ×
// one or more channels. Each (target, channel) pair is handled
// independently by src/lib/server/messages.ts and always produces a
// SchoolMessage row, so a partial failure (e.g. one parent has no email on
// file) never blocks the rest of the batch — the response lists a status
// per pair for the UI to show individually.
//
// Gated to the 'messages' menu — sending parent/teacher communications is a
// staff action, not something an unauthenticated visitor should trigger.
export const runtime = 'nodejs';
export const maxDuration = 60;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { zCuid } from '@/lib/server/zod-helpers';
import { sendSchoolMessage } from '@/lib/server/messages';
import { requireSchoolId } from '@/lib/server/tenant/context';

const Body = z
  .object({
    recipientType: z.enum(['STUDENT_PARENT', 'TEACHER']),
    targetIds: z.array(zCuid).min(1).max(2000),
    channels: z.array(z.enum(['EMAIL', 'SMS'])).min(1).max(2),
    templateType: z.enum(['ABSENCE', 'CONVOCATION', 'LIBRE']),
    date: z.string().trim().max(60).optional(),
    motif: z.string().trim().max(300).optional(),
    customSubject: z.string().trim().max(200).optional(),
    customBody: z.string().trim().max(5000).optional(),
    locale: z.enum(['fr', 'en']).optional(),
  })
  .refine((b) => b.templateType !== 'ABSENCE' || b.recipientType === 'STUDENT_PARENT', {
    message: "Le modèle Absence ne s'applique qu'aux parents d'élèves",
    path: ['templateType'],
  })
  .refine((b) => b.templateType !== 'LIBRE' || !!b.customBody?.trim(), {
    message: 'Le message libre doit contenir un texte',
    path: ['customBody'],
  });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'messages' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;
    const schoolId = requireSchoolId(auth.user.schoolId);

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const results = [];
    for (const targetId of data.targetIds) {
      for (const channel of data.channels) {
        const result = await sendSchoolMessage(prisma, schoolId, {
          recipientType: data.recipientType,
          targetId,
          channel,
          templateType: data.templateType,
          ...(data.date !== undefined ? { date: data.date } : {}),
          ...(data.motif !== undefined ? { motif: data.motif } : {}),
          ...(data.customSubject !== undefined ? { customSubject: data.customSubject } : {}),
          ...(data.customBody !== undefined ? { customBody: data.customBody } : {}),
          ...(data.locale !== undefined ? { locale: data.locale } : {}),
        });
        results.push(result);
      }
    }

    return NextResponse.json({ results }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

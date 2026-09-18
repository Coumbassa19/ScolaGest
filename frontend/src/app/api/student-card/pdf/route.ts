// GET /api/student-card/pdf?studentId= — "Télécharger PDF" on
//     /student-card: downloads that one student's ID card as a PDF, at real
//     CR80 card size (85.6mm × 53.98mm), centered on an A4 page. Shares the
//     card layout (src/lib/server/student-card-pdf.ts) with the bulk export
//     (/api/student-cards/pdf), so a single download here always matches
//     the card's spot on a printed class sheet. Same PII exposure as the
//     bulk export, so it gets the same 'students' menu gate.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getStudentCardData } from '@/lib/server/student-card';
import { buildStudentCardPdf } from '@/lib/server/student-card-pdf';
import { requireSchoolId } from '@/lib/server/tenant/context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || undefined;

    if (!studentId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'studentId est obligatoire.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data = await getStudentCardData(
      auth.user.prisma,
      requireSchoolId(auth.user.schoolId),
      studentId,
    );
    if (!data) {
      return NextResponse.json(
        { error: 'STUDENT_NOT_FOUND', message: 'Élève introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const buffer = await buildStudentCardPdf(data);
    const filename = `carte-${data.nom}-${data.prenom}.pdf`.replace(/[^\w.-]+/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'x-request-id': ctx.requestId,
      },
    });
  });
}

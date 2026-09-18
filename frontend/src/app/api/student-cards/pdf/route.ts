// GET /api/student-cards/pdf?classId= — "Télécharger toutes les cartes
//     (PDF)" on /student-cards: downloads every student's ID card for the
//     class as ONE print-and-cut PDF sheet — real CR80 card size, tiled 2
//     columns × 4 rows per A4 page, pages following each other for classes
//     with more than 8 students. Cards are in the same order as the class
//     list (nom, prenom). Layout lives in src/lib/server/student-card-pdf.ts.
//     A PDF full of names, photos and QR-coded matricules is exactly the
//     kind of student PII this cluster exists to stop leaking, so it's
//     gated to the 'students' menu like the page that links to it.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getClassCardData } from '@/lib/server/student-card';
import { buildClassCardsPdf } from '@/lib/server/student-card-pdf';
import { requireSchoolId } from '@/lib/server/tenant/context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'students' });
    if (auth instanceof NextResponse) return auth;
    const prisma = auth.user.prisma;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId') || undefined;

    if (!classId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'classId est obligatoire.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: classId } });
    if (!schoolClass) {
      return NextResponse.json(
        { error: 'CLASS_NOT_FOUND', message: 'Classe introuvable' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const students = await getClassCardData(prisma, requireSchoolId(auth.user.schoolId), classId);
    if (students.length === 0) {
      return NextResponse.json(
        { error: 'NO_STUDENTS', message: 'Aucun élève dans cette classe.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const buffer = await buildClassCardsPdf(students);
    const filename = `cartes-${schoolClass.name}.pdf`.replace(/[^\w.-]+/g, '_');

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

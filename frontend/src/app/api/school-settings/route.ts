// GET   /api/school-settings — the single-row school identity config (name,
//       address, contact, logo, République/devise) shown on the bulletin
//       and the student ID card, edited from Paramètres > "Informations de
//       l'établissement". Gated to the 'settings' menu.
// PATCH /api/school-settings — partial update. All fields optional — only
//       provided ones change. logoUrl/flagUrl are data: URLs, PNG/JPEG only
//       (same "no Cloudinary yet" pattern as Student.photoUrl) — the PDF
//       export embeds them directly and can't rasterize SVG. Gated to the
//       'settings' menu. featuredOnHomepage/homepageLogoUrl are a separate
//       opt-in for the public homepage's "trusted by" showcase — stored on
//       School, not SchoolSettings (src/lib/server/school-settings.ts
//       handles the split).
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
import { getSchoolSettings, updateSchoolSettings } from '@/lib/server/school-settings';
import { requireSchoolId } from '@/lib/server/tenant/context';

const LOGO_DATA_URL_RE = /^data:image\/(png|jpe?g);base64,/i;

const Body = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  type: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  email: z.string().trim().email().max(160).optional(),
  logoUrl: z
    .string()
    .trim()
    .max(700_000)
    .regex(LOGO_DATA_URL_RE, 'Logo invalide — PNG ou JPG uniquement.')
    .nullable()
    .optional(),
  republiqueName: z.string().trim().min(1).max(120).optional(),
  devise: z.string().trim().min(1).max(120).optional(),
  ministryName: z.string().trim().min(1).max(160).optional(),
  flagUrl: z
    .string()
    .trim()
    .max(700_000)
    .regex(LOGO_DATA_URL_RE, 'Drapeau invalide — PNG ou JPG uniquement.')
    .nullable()
    .optional(),
  featuredOnHomepage: z.boolean().optional(),
  homepageLogoUrl: z
    .string()
    .trim()
    .max(700_000)
    .regex(LOGO_DATA_URL_RE, 'Logo invalide — PNG ou JPG uniquement.')
    .nullable()
    .optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'settings' });
    if (auth instanceof NextResponse) return auth;

    const settings = await getSchoolSettings(auth.user.prisma, requireSchoolId(auth.user.schoolId));
    return NextResponse.json({ settings }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireStaff({ menuKey: 'settings' });
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => null);
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Champs invalides.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const settings = await updateSchoolSettings(
      auth.user.prisma,
      requireSchoolId(auth.user.schoolId),
      parsed.data,
    );
    return NextResponse.json({ settings }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

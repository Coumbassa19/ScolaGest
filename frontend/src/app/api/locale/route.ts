// POST /api/locale — sets the `locale` cookie the LanguageSwitcher toggles
// (src/components/LanguageSwitcher.tsx). Read server-side on every request
// by src/i18n/request.ts. No auth/CSRF needed: it only ever writes one of
// two known-safe values (fr|en) and changes nothing about the account.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { LOCALE_COOKIE, LOCALES } from '@/i18n/locale';

const Body = z.object({ locale: z.enum(LOCALES) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
      { status: 400 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCALE_COOKIE, parsed.data.locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return res;
}

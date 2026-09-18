// Reads the active locale from the same cookie next-intl's request config
// (src/i18n/request.ts) reads — for server code that needs the locale
// OUTSIDE a rendered Server Component tree (e.g. building an outbox event
// payload before an email is composed later by a cron job).
//
// Deliberately does NOT use next-intl's `getLocale()`: that helper resolves
// to next-intl's react-client bundle under Vitest's module resolution
// (`getLocale is not supported in Client Components`), even though it works
// fine inside a real Next.js request. Reading the cookie directly sidesteps
// that and is exactly what next-intl does internally anyway.
import 'server-only';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/locale';

export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

// Shared between the server (src/i18n/request.ts, the locale API route) and
// the client (LanguageSwitcher) — the single source of truth for which
// locales exist and how the choice is persisted.
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fr';
export const LOCALE_COOKIE = 'locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

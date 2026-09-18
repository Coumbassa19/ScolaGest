// next-intl request config — "without i18n routing" mode: the locale is
// read from a cookie, not the URL, so none of the app's 40+ existing routes
// need to move under a [locale] segment. See src/i18n/locale.ts for the
// cookie name/allowed values and src/components/LanguageSwitcher.tsx for how
// it's changed. Registered as the plugin config path in next.config.ts.
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './locale';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});

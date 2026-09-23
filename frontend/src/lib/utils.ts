import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format an integer amount with a non-breaking space as thousands separator
 * (and between the amount and currency, when given) — so "3 000 000 GNF"
 * never wraps mid-number onto two lines in a narrow container.
 */
export function formatPrice(amount: number, currency: string = ''): string {
  // Some locales (e.g. fr-FR) already emit non-breaking spaces (U+00A0) as
  // the grouping separator; normalise any whitespace to U+00A0 explicitly
  // so this doesn't depend on locale/browser behavior.
  const formatted = amount.toLocaleString('fr-FR').replace(/\s/g, '\u00A0');
  return currency ? `${formatted}\u00A0${currency}` : formatted;
}

/**
 * Detect in-app browsers (Facebook, Instagram, TikTok). These WebViews
 * often block redirects to native payment apps.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|TikTok|musical_ly|BytedanceWebview/i.test(ua);
}

/** Detect specifically the TikTok WebView. */
export function isTikTokBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /TikTok|musical_ly|BytedanceWebview/i.test(ua);
}

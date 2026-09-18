'use client';

// The "sign" to switch the whole application between French and English —
// lives in the Sidebar (visible on every authenticated page) and on the
// auth screens via AuthCard. Persists the choice server-side in a cookie
// (src/app/api/locale/route.ts) so every Server Component page — not just
// this one — renders in the chosen language on the next request.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { api } from '@/lib/api';
import type { Locale } from '@/i18n/locale';

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);

  function switchTo(next: Locale): void {
    if (next === locale || isPending) return;
    setPendingLocale(next);
    void api('/api/locale', { method: 'POST', body: { locale: next } })
      .then(() => {
        startTransition(() => {
          router.refresh();
        });
      })
      .finally(() => setPendingLocale(null));
  }

  return (
    <div
      className={`inline-flex items-center rounded-md border border-border overflow-hidden text-xs font-semibold ${className}`}
      role="group"
      aria-label="Language / Langue"
    >
      {(['fr', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchTo(code)}
          disabled={isPending}
          aria-pressed={locale === code}
          className={`px-2.5 py-1 transition-colors ${
            locale === code
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface text-muted-foreground hover:text-foreground'
          } disabled:opacity-60`}
        >
          {pendingLocale === code ? '…' : code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

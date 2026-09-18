'use client';

// Generic debounced search box that navigates by setting a `search` query
// param, preserving any other params passed in via `currentQuery` — the
// text-input counterpart to QueryFilterSelect. Debounced (not every
// keystroke) and uses router.replace (not push) so typing doesn't spam
// browser history.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';

const DEBOUNCE_MS = 350;

export default function TextFilterInput({
  param = 'search',
  basePath,
  currentQuery,
  placeholder,
  className,
}: {
  param?: string;
  basePath: string;
  currentQuery: Record<string, string | undefined>;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const t = useTranslations('common');
  const [value, setValue] = useState(currentQuery[param] ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stay in sync if the URL changes from elsewhere (e.g. another filter
  // control resets it).
  const currentValue = currentQuery[param] ?? '';
  useEffect(() => {
    setValue(currentValue);
  }, [currentValue]);

  function onChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, val] of Object.entries(currentQuery)) {
        if (val && key !== param) params.set(key, val);
      }
      if (next.trim()) params.set(param, next.trim());
      const qs = params.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    }, DEBOUNCE_MS);
  }

  return (
    <div className={className ?? 'relative w-full sm:w-64'}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('searchPlaceholder')}
        className="w-full border border-border rounded-md pl-9 pr-3 py-2 bg-background text-sm text-foreground placeholder-muted-foreground"
      />
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        <Icon i="search" size={16} />
      </div>
    </div>
  );
}

'use client';

// Real search box for TopBar — was previously a decorative div with a
// "Rechercher..." placeholder span and no <input> at all, so typing never
// did anything. Debounces (300ms) then navigates to `${basePath}?q=...` so
// the server-component page can filter its list from `searchParams.q`.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';

export default function TopBarSearch({
  basePath,
  initialQuery = '',
  placeholder,
  paramName = 'q',
}: {
  basePath: string;
  initialQuery?: string;
  placeholder?: string;
  /** Query-string key the target page reads its search term from (e.g. "q" for /teachers, "search" for /students). */
  paramName?: string;
}) {
  const router = useRouter();
  const t = useTranslations('topBar');
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    // Nothing to do while the box still reflects what the URL already says
    // (including right after mount, before the user has typed anything) —
    // without this guard, mounting the box would itself navigate to
    // `basePath` after the debounce. That's invisible when basePath is the
    // current page, but force-navigates away from any other page (e.g. the
    // dashboard's default search target).
    if (value === initialQuery) return;
    const timer = setTimeout(() => {
      router.push(
        value.trim() ? `${basePath}?${paramName}=${encodeURIComponent(value.trim())}` : basePath,
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [value, initialQuery, basePath, paramName, router]);

  return (
    <div className="hidden md:flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-input w-full md:w-56">
      <Icon i="search" size={14} />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? t('search')}
        className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full min-w-0"
      />
    </div>
  );
}

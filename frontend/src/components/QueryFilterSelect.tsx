'use client';

// Generic real <select> that navigates by setting a query param, preserving
// any other params passed in via `currentQuery`. Used by list pages (grades,
// schedule) that need more than one independent filter. Takes the current
// query as a prop (rather than reading `useSearchParams`) so it never needs
// a <Suspense> boundary and stays in sync with the server-rendered page.
import { useRouter } from 'next/navigation';
import Icon from '@/components/global/Icon';

export interface QueryFilterOption {
  value: string;
  label: string;
}

export default function QueryFilterSelect({
  param,
  options,
  placeholder,
  className,
  basePath,
  currentQuery,
}: {
  param: string;
  options: QueryFilterOption[];
  placeholder?: string;
  className?: string;
  basePath: string;
  currentQuery: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const current = currentQuery[param] ?? '';

  function onChange(value: string) {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(currentQuery)) {
      if (val) params.set(key, val);
    }
    if (value) params.set(param, value);
    else params.delete(param);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <div className="relative inline-block">
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ??
          'appearance-none border border-border rounded-md pl-3 pr-8 py-1.5 bg-background text-sm text-foreground cursor-pointer'
        }
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <Icon i="chevron-down" size={14} />
      </div>
    </div>
  );
}

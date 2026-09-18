import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Icon from '@/components/global/Icon';
import TopBarSearch from '@/components/TopBarSearch';
import NotificationBell from '@/components/NotificationBell';

export interface TopBarProps {
  title?: string;
  subtitle?: string;
  /** When set, renders a working search box that navigates to `${searchBasePath}?${searchParamName}=...`. */
  searchBasePath?: string;
  searchQuery?: string;
  /** Query-string key the target page reads its search term from. Defaults to "q". */
  searchParamName?: string;
}

// Pages that don't own a searchable list of their own (e.g. the dashboard)
// still get a working search box — it just searches the student register,
// the most common "find something" starting point in a school app.
const DEFAULT_SEARCH_BASE_PATH = '/students';
const DEFAULT_SEARCH_PARAM_NAME = 'search';

export default async function TopBar({
  title,
  subtitle = '',
  searchBasePath,
  searchQuery = '',
  searchParamName,
}: TopBarProps) {
  const t = await getTranslations('topBar');
  const td = await getTranslations('dashboard');
  const effectiveBasePath = searchBasePath ?? DEFAULT_SEARCH_BASE_PATH;
  const effectiveParamName = searchParamName ?? (searchBasePath ? 'q' : DEFAULT_SEARCH_PARAM_NAME);
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-0 items-start md:justify-between px-4 py-3 md:px-8 md:py-4 bg-secondary border-b border-border">
      <div>
        <h1 className="text-2xl font-headings font-semibold text-foreground">
          {title ?? td('title')}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
        {/* Search */}
        <TopBarSearch
          basePath={effectiveBasePath}
          initialQuery={searchQuery}
          paramName={effectiveParamName}
        />
        {/* Add revenue CTA */}
        <Link
          href="/new-revenue"
          className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-md text-sm font-semibold"
        >
          <Icon i="plus" size={14} />
          {t('revenueReceived')}
        </Link>
        {/* Notifications */}
        <NotificationBell />
      </div>
    </div>
  );
}

'use client';

// Minimal header for the parent portal (/parent) — no Sidebar: a parent's
// surface is a handful of read-only sections for their own children, not
// the full staff app, so it gets its own tiny chrome instead of the
// Sidebar's 10-menu navigation.
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';

export default function ParentHeader({ schoolName }: { schoolName: string }) {
  const t = useTranslations('parentPortal');
  const { user, logout } = useAuth();
  const displayName = user?.name?.trim() || user?.email || '';

  async function handleLogout() {
    if (!window.confirm(t('confirmLogout'))) return;
    await logout();
    window.location.assign('/login');
  }

  return (
    <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
          {schoolName}
        </p>
        <h1 className="text-lg md:text-xl font-headings font-semibold text-foreground truncate">
          {t('title')}
        </h1>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[200px]">
          {displayName}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="px-3 py-1.5 text-xs font-semibold text-foreground border border-border rounded-md bg-surface"
        >
          {t('logout')}
        </button>
      </div>
    </div>
  );
}

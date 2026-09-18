'use client';

// Real notification bell for TopBar — was previously a static icon with a
// hardcoded "3" badge and no click handler. Backed by the existing
// /api/notifications{,/count} endpoints (NOTIF-01/02/03), which already had
// full server + test coverage but no UI consumer.

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';
import { api } from '@/lib/api';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

function relativeTime(
  iso: string,
  now: Date,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return t('justNow');
  if (diffH < 24) return t('hoursAgo', { h: diffH });
  const diffDays = Math.floor(diffH / 24);
  if (diffDays === 1) return t('yesterday');
  return t('daysAgo', { d: diffDays });
}

export default function NotificationBell() {
  const t = useTranslations('notifications');
  const td = useTranslations('dashboard');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ count: number }>('/api/notifications/count')
      .then((res) => setCount(res.count))
      .catch(() => {
        // Silent — the badge just stays at 0 if this fails.
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function loadItems() {
    setLoading(true);
    setError(false);
    api<{ items: NotificationItem[] }>('/api/notifications?limit=10')
      .then((res) => setItems(res.items))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && items === null) loadItems();
  }

  async function markOneRead(id: string) {
    const item = items?.find((i) => i.id === id);
    if (!item || item.readAt) return;
    setItems((prev) =>
      prev ? prev.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)) : prev,
    );
    setCount((c) => Math.max(0, c - 1));
    try {
      await api('/api/notifications', { method: 'PATCH', body: { ids: [id] } });
    } catch {
      // Best-effort — a failed mark-read just leaves the item shown as read
      // locally until the next full reload, which is an acceptable tradeoff.
    }
  }

  async function markAllRead() {
    const hadUnread = items?.some((i) => !i.readAt);
    setItems((prev) => (prev ? prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) : prev));
    setCount(0);
    if (hadUnread) {
      try {
        await api('/api/notifications', { method: 'PATCH', body: { ids: 'all' } });
      } catch {
        // Best-effort, same as markOneRead.
      }
    }
  }

  const now = new Date();

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={t('openAria')}
        aria-expanded={open}
        className="w-9 h-9 rounded-md border border-border bg-surface flex items-center justify-center"
      >
        <Icon i="bell" size={16} />
      </button>
      {count > 0 && (
        <span
          role="status"
          aria-label={t('unreadBadgeAria', { count })}
          className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 bg-danger rounded-full flex items-center justify-center text-xs text-primary-foreground font-semibold"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-surface border border-border rounded-lg shadow-lg z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">{t('title')}</span>
            {items && items.some((i) => !i.readAt) && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-semibold text-primary"
              >
                {t('markAllRead')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                {tc('loading')}
              </p>
            )}
            {!loading && error && (
              <p className="px-4 py-6 text-sm text-danger text-center">{t('loadError')}</p>
            )}
            {!loading && !error && items && items.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">{t('empty')}</p>
            )}
            {!loading &&
              !error &&
              items?.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void markOneRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 ${
                    n.readAt ? '' : 'bg-secondary/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.readAt && (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {relativeTime(n.createdAt, now, (key, values) =>
                          td(key as 'justNow', values),
                        )}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

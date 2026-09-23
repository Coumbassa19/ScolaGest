'use client';

// "Modifier les accès" page (src/app/settings/users/[id]/edit) — lets an
// ADMIN/SUPERADMIN change which menus an EXISTING DIRECTION/TEACHER/STAFF
// account can reach, via PATCH /api/admin/users/[id]/menus. Previously this
// could only be picked once, at account creation (see CreateUserForm) —
// this reuses its exact menu-checkbox pattern/labels for an existing user.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { MENU_KEYS, type MenuKey } from '@/lib/server/permissions/menu-keys';
import { MENU_LABEL_KEY, coreMenusFor, type StaffRole } from '@/components/forms/CreateUserForm';

export default function EditUserMenusForm({
  userId,
  email,
  name,
  role,
  initialEnabledMenus,
}: {
  userId: string;
  email: string;
  name: string | null;
  role: StaffRole;
  initialEnabledMenus: string[];
}) {
  const t = useTranslations('settings.users.edit');
  const tSidebar = useTranslations('sidebar');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();

  const core = coreMenusFor(role);
  const pickableMenus = MENU_KEYS.filter((k) => !core.includes(k));
  const validInitial = initialEnabledMenus.filter((m): m is MenuKey =>
    (MENU_KEYS as readonly string[]).includes(m),
  );
  const [enabledMenus, setEnabledMenus] = useState<Set<MenuKey>>(new Set(validInitial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleMenu(key: MenuKey) {
    setEnabledMenus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api(`/api/admin/users/${userId}/menus`, {
        method: 'PATCH',
        body: { enabledMenus: Array.from(enabledMenus) },
      });
      toast(t('savedToast'), 'success');
      router.push('/settings');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      <div className="bg-surface rounded-lg border border-border px-6 py-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {name ? `${name} — ${email}` : email}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('roleLine', { role: t(`role.${role}` as never) })}
          </p>
        </div>

        {pickableMenus.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noPickableMenus')}</p>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {t('coreMenusNote', {
                menus: core.map((k) => tSidebar(MENU_LABEL_KEY[k])).join(', '),
              })}
            </p>
            <p className="text-xs text-muted-foreground mb-3">{t('menusHint')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {pickableMenus.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={enabledMenus.has(key)}
                    onChange={() => toggleMenu(key)}
                    className="rounded border-border"
                  />
                  {tSidebar(MENU_LABEL_KEY[key])}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.push('/settings')}
          className="px-6 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
        >
          {submitting ? tCommon('saving') : tCommon('save')}
        </button>
      </div>
    </form>
  );
}

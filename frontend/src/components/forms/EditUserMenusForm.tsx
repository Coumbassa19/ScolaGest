'use client';

// "Modifier les accès" page (src/app/settings/users/[id]/edit) — lets an
// ADMIN/SUPERADMIN, or a DIRECTION account on its own school, change an
// EXISTING DIRECTION/TEACHER/STAFF account's menus, and now its role too
// (PATCH /api/admin/users/[id]/school-role) — e.g. promoting a STAFF login
// (Mr Diallo, hired as "Comptable") to DIRECTION without deleting and
// recreating the account (there's no delete endpoint, and a new account
// can't reuse an email still attached to the old one anyway).
//
// The teacher/staff picker only appears when the selected role actually
// differs from the account's current role — if you're just here to tweak
// menus, nothing about the role section changes, and the picker (which
// excludes this account's own currently-linked teacher/staff, since they're
// not "unlinked") never shows up to confuse that common case.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { MENU_KEYS, type MenuKey } from '@/lib/server/permissions/menu-keys';
import {
  MENU_LABEL_KEY,
  coreMenusFor,
  type StaffRole,
  type UnlinkedTeacherOption,
  type UnlinkedStaffOption,
} from '@/components/forms/CreateUserForm';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

type SchoolRole = 'DIRECTION' | 'TEACHER' | 'STAFF';

// Maps PATCH /api/admin/users/[id]/school-role's error codes to translation
// keys. Reuses settings.users.new's teacher/staff error copy (same meaning,
// same wording an admin already saw once on the create-user form) instead
// of duplicating it here.
const ROLE_ERROR_KEYS: Record<string, string> = {
  TEACHER_ID_REQUIRED: 'errorTeacherRequired',
  STAFF_ID_REQUIRED: 'errorStaffRequired',
  TEACHER_NOT_FOUND: 'errorTeacherNotFound',
  TEACHER_ALREADY_LINKED: 'errorTeacherAlreadyLinked',
  STAFF_NOT_FOUND: 'errorStaffNotFound',
  STAFF_ALREADY_LINKED: 'errorStaffAlreadyLinked',
};

export default function EditUserMenusForm({
  userId,
  email,
  name,
  role: initialRole,
  initialEnabledMenus,
  unlinkedTeachers,
  unlinkedStaff,
}: {
  userId: string;
  email: string;
  name: string | null;
  role: SchoolRole;
  initialEnabledMenus: string[];
  unlinkedTeachers: UnlinkedTeacherOption[];
  unlinkedStaff: UnlinkedStaffOption[];
}) {
  const t = useTranslations('settings.users.edit');
  const tNew = useTranslations('settings.users.new');
  const tUsers = useTranslations('settings.users');
  const tSidebar = useTranslations('sidebar');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();

  const [role, setRole] = useState<SchoolRole>(initialRole);
  const [teacherId, setTeacherId] = useState('');
  const [staffId, setStaffId] = useState('');
  const roleChanged = role !== initialRole;

  const core = coreMenusFor(role as StaffRole);
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

    if (roleChanged && role === 'TEACHER' && !teacherId) {
      setError(tNew('errorTeacherRequired'));
      return;
    }
    if (roleChanged && role === 'STAFF' && !staffId) {
      setError(tNew('errorStaffRequired'));
      return;
    }

    setSubmitting(true);
    try {
      if (roleChanged) {
        await api(`/api/admin/users/${userId}/school-role`, {
          method: 'PATCH',
          body: {
            role,
            ...(role === 'TEACHER' ? { teacherId } : {}),
            ...(role === 'STAFF' ? { staffId } : {}),
          },
        });
      }
      await api(`/api/admin/users/${userId}/menus`, {
        method: 'PATCH',
        body: { enabledMenus: Array.from(enabledMenus) },
      });
      toast(t('savedToast'), 'success');
      router.push('/settings');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const key = ROLE_ERROR_KEYS[err.code];
        setError(key ? tNew(key as never) : err.message);
      } else {
        setError(tCommon('networkError'));
      }
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
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('roleFieldLabel')}
          </label>
          <select
            value={role}
            onChange={(e) => {
              const next = e.target.value as SchoolRole;
              setRole(next);
              setTeacherId('');
              setStaffId('');
            }}
            className={fieldClass}
          >
            <option value="DIRECTION">{tUsers('roleDirection')}</option>
            <option value="TEACHER">{tUsers('roleTeacher')}</option>
            <option value="STAFF">{tUsers('roleStaff')}</option>
          </select>
          {roleChanged && <p className="text-xs text-warning mt-1.5">{t('roleChangeWarning')}</p>}
        </div>

        {roleChanged && role === 'TEACHER' && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {tNew('teacherLabel')}
            </label>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className={fieldClass}
            >
              <option value="">{tNew('teacherPlaceholder')}</option>
              {unlinkedTeachers.map((tch) => (
                <option key={tch.id} value={tch.id}>
                  {tch.nom} {tch.prenom}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">
              {unlinkedTeachers.length === 0 ? tNew('noTeachersAvailable') : tNew('teacherHint')}
            </p>
          </div>
        )}

        {roleChanged && role === 'STAFF' && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {tNew('staffLabel')}
            </label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className={fieldClass}
            >
              <option value="">{tNew('staffPlaceholder')}</option>
              {unlinkedStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom} {s.prenom} — {s.poste}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">
              {unlinkedStaff.length === 0 ? tNew('noStaffAvailable') : tNew('staffHint')}
            </p>
          </div>
        )}

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

'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import {
  MENU_KEYS,
  TEACHER_CORE_MENUS,
  DIRECTION_CORE_MENUS,
  STAFF_CORE_MENUS,
  type MenuKey,
} from '@/lib/server/permissions/menu-keys';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

export interface UnlinkedTeacherOption {
  id: string;
  nom: string;
  prenom: string;
}

export interface UnlinkedStaffOption {
  id: string;
  nom: string;
  prenom: string;
  poste: string;
}

export type StaffRole = 'DIRECTION' | 'TEACHER' | 'STAFF' | 'ADMIN' | 'SUPERADMIN';

interface CreateUserResponse {
  user: { id: string; email: string };
  emailStatus: 'SENT' | 'FAILED' | 'UNAVAILABLE';
  emailError?: string;
  setupUrl: string;
}

// Maps the stable `error` codes POST /api/admin/users returns to the
// matching translation key in `settings.users.new` — `err.message` is only
// ever an English fallback string from the API and must never be shown
// directly.
const ERROR_KEYS: Record<string, string> = {
  EMAIL_TAKEN: 'errorEmailTaken',
  TEACHER_NOT_FOUND: 'errorTeacherNotFound',
  TEACHER_ALREADY_LINKED: 'errorTeacherAlreadyLinked',
  STAFF_NOT_FOUND: 'errorStaffNotFound',
  STAFF_ALREADY_LINKED: 'errorStaffAlreadyLinked',
  SUPERADMIN_REQUIRED: 'errorSuperadminRequired',
  TEACHER_ID_REQUIRED: 'errorTeacherRequired',
  STAFF_ID_REQUIRED: 'errorStaffRequired',
};

// The 10 school-domain menus map 1:1 onto Sidebar.tsx's navItems — reuse
// its translation keys (namespace 'sidebar') instead of duplicating labels.
// Exported so EditUserMenusForm (editing an EXISTING account's menus) can
// reuse the exact same lookup instead of duplicating it.
export const MENU_LABEL_KEY: Record<MenuKey, string> = {
  dashboard: 'dashboard',
  students: 'studentsGroup',
  teachers: 'teachers',
  schedule: 'schedule',
  subjects: 'subjects',
  grades: 'grades',
  accounting: 'accountingGroup',
  absences: 'absences',
  messages: 'messagesGroup',
  settings: 'settings',
};

export function coreMenusFor(role: StaffRole): readonly MenuKey[] {
  if (role === 'TEACHER') return TEACHER_CORE_MENUS;
  if (role === 'DIRECTION') return DIRECTION_CORE_MENUS;
  if (role === 'STAFF') return STAFF_CORE_MENUS;
  return []; // ADMIN/SUPERADMIN are unrestricted — no menu picker shown for them
}

export default function CreateUserForm({
  canCreateAdmins,
  unlinkedTeachers,
  unlinkedStaff,
}: {
  canCreateAdmins: boolean;
  unlinkedTeachers: UnlinkedTeacherOption[];
  unlinkedStaff: UnlinkedStaffOption[];
}) {
  const t = useTranslations('settings.users.new');
  const tSidebar = useTranslations('sidebar');
  const tUsers = useTranslations('settings.users');
  const tCommon = useTranslations('common');

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('TEACHER');
  const [teacherId, setTeacherId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [enabledMenus, setEnabledMenus] = useState<Set<MenuKey>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateUserResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const core = coreMenusFor(role);
  const pickableMenus = MENU_KEYS.filter((k) => !core.includes(k));

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

    if (role === 'TEACHER' && !teacherId) {
      setError(t('errorTeacherRequired'));
      return;
    }
    if (role === 'STAFF' && !staffId) {
      setError(t('errorStaffRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        email: email.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        role,
        ...(role === 'TEACHER' ? { teacherId } : {}),
        ...(role === 'STAFF' ? { staffId } : {}),
        ...(enabledMenus.size > 0 ? { enabledMenus: Array.from(enabledMenus) } : {}),
      };
      const res = await api<CreateUserResponse>('/api/admin/users', { method: 'POST', body });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        setError(key ? t(key as never) : err.message);
      } else {
        setError(tCommon('networkError'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="max-w-2xl bg-surface rounded-lg border border-border px-6 py-5">
        <h2 className="text-lg font-headings font-semibold text-foreground mb-2">
          {t('successTitle')}
        </h2>
        <p className="text-sm text-foreground mb-4">
          {result.emailStatus === 'SENT'
            ? t('successEmailSent', { email: result.user.email })
            : t('successEmailFailed', { reason: result.emailError ?? result.emailStatus })}
        </p>

        <div className="mb-6">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            {t('setupLinkLabel')}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={result.setupUrl}
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 border border-border rounded-md px-3 py-2 bg-background text-foreground text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(result.setupUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface shrink-0"
            >
              {copied ? t('copied') : t('copyLink')}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{t('setupLinkHint')}</p>
        </div>

        <Link
          href="/settings"
          className="inline-block px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
        >
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      <div className="bg-surface rounded-lg border border-border px-6 py-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('emailLabel')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('roleLabel')}
          </label>
          <select
            value={role}
            onChange={(e) => {
              const next = e.target.value as StaffRole;
              setRole(next);
              if (next !== 'TEACHER') setTeacherId('');
              if (next !== 'STAFF') setStaffId('');
              setEnabledMenus(new Set());
            }}
            className={fieldClass}
          >
            <option value="TEACHER">{tUsers('roleTeacher')}</option>
            <option value="DIRECTION">{tUsers('roleDirection')}</option>
            <option value="STAFF">{tUsers('roleStaff')}</option>
            {canCreateAdmins && <option value="ADMIN">{tUsers('roleAdmin')}</option>}
            {canCreateAdmins && <option value="SUPERADMIN">{tUsers('roleSuperadmin')}</option>}
          </select>
        </div>

        {role === 'TEACHER' && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('teacherLabel')}
            </label>
            {unlinkedTeachers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noTeachersAvailable')}</p>
            ) : (
              <>
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">{t('teacherPlaceholder')}</option>
                  {unlinkedTeachers.map((tch) => (
                    <option key={tch.id} value={tch.id}>
                      {tch.nom} {tch.prenom}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1.5">{t('teacherHint')}</p>
              </>
            )}
          </div>
        )}

        {role === 'STAFF' && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('staffLabel')}
            </label>
            {unlinkedStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noStaffAvailable')}</p>
            ) : (
              <>
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">{t('staffPlaceholder')}</option>
                  {unlinkedStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom} {s.prenom} — {s.poste}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1.5">{t('staffHint')}</p>
              </>
            )}
          </div>
        )}

        {(role === 'TEACHER' || role === 'DIRECTION' || role === 'STAFF') && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('menusLabel')}
            </label>
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
        <Link
          href="/settings"
          className="px-6 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
        >
          {t('cancel')}
        </Link>
        <button
          type="submit"
          disabled={
            submitting ||
            (role === 'TEACHER' && unlinkedTeachers.length === 0) ||
            (role === 'STAFF' && unlinkedStaff.length === 0)
          }
          className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}

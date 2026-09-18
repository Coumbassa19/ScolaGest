'use client';

// Personal info card on /profile — replaces the old static mockup (hardcoded
// "Coumbassa Diallo", a non-working "Modifier" button) with real, editable
// account data: name, phone, and a profile photo, all persisted via
// PATCH /api/auth/me. Email and role stay read-only here — email has its own
// verification flow, and role is admin-managed.

import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import UserAvatar from '@/components/global/UserAvatar';
import { useToast } from '@/contexts/ToastContext';

const MAX_PHOTO_BYTES = 500_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProfileAccountCard() {
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const locale = useLocale();
  const { user, loading, refresh } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local editable state starts empty (user isn't loaded yet on first
  // render) and syncs once when the real account data arrives — using
  // user.id as the dependency (not the whole user object) so this doesn't
  // clobber in-progress edits every time `user` is re-fetched.
  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setPhone(user.phone ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
    }
  }, [user?.id]);

  if (loading || !user) {
    return (
      <div className="bg-surface rounded-lg border border-border px-4 py-6 md:px-8">
        <p className="text-sm text-muted-foreground">{t('loadingProfile')}</p>
      </div>
    );
  }

  async function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('errorImageType'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t('errorImageSize'));
      return;
    }
    setError(null);
    setSaved(false);
    setAvatarUrl(await readFileAsDataUrl(file));
  }

  function onRemovePhoto() {
    setAvatarUrl('');
    setSaved(false);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: {
          name: name.trim(),
          phone: phone.trim(),
          avatarUrl: avatarUrl || null,
        },
      });
      await refresh();
      setSaved(true);
      toast(tCommon('updatedToast'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface rounded-lg border border-border px-4 py-6 md:px-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start sm:gap-6">
        {/* Avatar + upload controls */}
        <div className="flex-shrink-0 flex flex-col items-center gap-2">
          <UserAvatar
            src={avatarUrl}
            gender="male"
            heritage="African"
            ageGroup="35-50"
            index={2}
            className="w-24 h-24"
          />
          <label className="text-xs font-semibold text-primary cursor-pointer hover:underline">
            {t('changePhoto')}
            <input type="file" accept="image/*" onChange={onPhotoChange} className="hidden" />
          </label>
          {avatarUrl && (
            <button
              type="button"
              onClick={onRemovePhoto}
              className="text-xs text-danger font-semibold"
            >
              {t('removePhoto')}
            </button>
          )}
        </div>

        {/* Editable identity fields */}
        <div className="flex-1 w-full min-w-0">
          <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                {t('fullNameLabel')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
                placeholder={t('fullNamePlaceholder')}
                className="text-xl font-headings font-semibold text-foreground bg-transparent border-b border-border focus:outline-none w-full"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {t(`roles.${user.role}` as 'roles.USER')}
              </p>
            </div>
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
                user.emailVerifiedAt
                  ? 'text-success bg-success/10 border-success/20'
                  : 'text-warning bg-warning/10 border-warning/20'
              }`}
            >
              {user.emailVerifiedAt ? t('emailVerified') : t('emailNotVerified')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">{t('emailLabel')}</p>
              <p className="text-foreground mt-1">{user.email}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                {t('phoneLabel')}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setSaved(false);
                }}
                placeholder={t('phonePlaceholder')}
                className="w-full border border-border rounded-md px-3 py-1.5 bg-background text-foreground text-sm"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">{t('memberSince')}</p>
              <p className="text-foreground mt-1">{fmtDate(user.createdAt, locale)}</p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger mt-3">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 justify-end pt-4 mt-4 border-t border-border">
            {saved && <span className="text-xs text-success">{t('profileUpdated')}</span>}
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
            >
              {saving ? tCommon('saving') : tCommon('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

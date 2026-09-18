'use client';

// "Compte" section on /settings — password change + Google OAuth linking,
// calling the real /api/auth/* endpoints. Extracted out of the page itself
// so /settings can be an async Server Component (it needs to fetch school
// settings server-side for the "Informations de l'établissement" section).
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

export default function AccountSecuritySection() {
  const user = useUser();
  const { refresh } = useAuth();
  const { toast } = useToast();
  const t = useTranslations('settings.account');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="bg-surface rounded-lg border border-border px-6 py-5">
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  const hasPassword = user.hasPassword;
  const googleLinked = user.linkedProviders.includes('google');

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length === 0) {
      setError(t('errorEmptyPassword'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('errorPasswordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast(t('successPasswordUpdated'), 'success');
      } else {
        await api('/api/auth/set-password', {
          method: 'POST',
          body: { newPassword },
        });
        toast(t('successPasswordSet'), 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          INVALID_CREDENTIALS: t('errorInvalidCurrentPassword'),
          PASSWORD_BANNED: t('errorPasswordBanned'),
          PASSWORD_TOO_SHORT: err.message || t('errorPasswordTooShort'),
          PASSWORD_TOO_WEAK: t('errorPasswordTooWeak'),
          PASSWORD_PWNED: t('errorPasswordPwned'),
          PASSWORD_ALREADY_SET: t('errorPasswordAlreadySet'),
          VALIDATION_FAILED: t('errorValidation'),
        };
        setError(map[err.code] ?? err.message);
      } else {
        setError(t('errorNetwork'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-surface rounded-lg border border-border px-6 py-5">
      <div className="mb-5 pb-5 border-b border-border">
        <h2 className="text-lg font-headings font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('loggedInAs', { email: user.email })}
        </p>
      </div>

      <div className="space-y-6">
        {/* Password */}
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {hasPassword ? t('changePassword') : t('setPassword')}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {hasPassword ? t('changePasswordHint') : t('setPasswordHint')}
          </p>
          <form onSubmit={onSubmitPassword} className="mt-3 flex flex-col gap-3 max-w-sm">
            {hasPassword && (
              <label className="flex flex-col gap-1 text-sm text-foreground">
                {t('currentPassword')}
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="rounded-md border border-border px-3 py-2 bg-background text-sm"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t('newPassword')}
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-md border border-border px-3 py-2 bg-background text-sm"
              />
              <span className="text-xs text-muted-foreground font-normal">{t('newPasswordHint')}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t('confirmPassword')}
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-md border border-border px-3 py-2 bg-background text-sm"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="self-start rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? t('saving') : hasPassword ? t('changePassword') : t('setPassword')}
            </button>
          </form>
        </div>

        {/* Linked providers */}
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">{t('linkedAccounts')}</h3>
          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{t('google')}</span>
              <span className="text-xs text-muted-foreground">
                {googleLinked ? t('googleLinkedHint') : t('googleUnlinkedHint')}
              </span>
            </div>
            {googleLinked ? (
              <span className="rounded-full border border-success bg-success-bg px-3 py-1 text-xs font-semibold text-success">
                {t('linked')}
              </span>
            ) : (
              <a
                href="/api/auth/oauth/google/start?next=/settings"
                className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground bg-surface hover:bg-input"
              >
                {t('linkGoogle')}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

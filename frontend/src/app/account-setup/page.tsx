// /account-setup — wires POST /api/auth/account-setup
// (frontend/src/app/api/auth/account-setup/route.ts). Based on
// /reset-password, but reads only ?token= from the URL (the invite email
// links here with the token baked in — no email/code fields to fill in).
// No auto-login on success — same reasoning as reset-password: the user
// logs in fresh on /login after activating.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import AuthCard from '@/components/auth/AuthCard';
import PasswordInput from '@/components/forms/PasswordInput';

const PASSWORD_MIN = 7; // mirrors AUTH_PASSWORD_MIN_LENGTH default (see .env.local)

// Mirrors meetsPasswordComplexity() in lib/server/auth/password-policy.ts —
// duplicated here (not imported) since that module is server-only.
function meetsComplexity(pw: string): boolean {
  return /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

const ERROR_KEYS: Record<string, string> = {
  SETUP_TOKEN_INVALID: 'setupTokenInvalid',
  SETUP_TOKEN_EXPIRED: 'setupTokenExpired',
  PASSWORD_BANNED: 'passwordBanned',
  PASSWORD_PWNED: 'passwordPwned',
  PASSWORD_TOO_WEAK: 'passwordTooWeak',
  VALIDATION_FAILED: 'validationFailedFields',
};

function AccountSetupForm() {
  const params = useSearchParams();
  const t = useTranslations('auth');
  const token = params.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < PASSWORD_MIN) {
      setError(t('errors.passwordTooShort', { min: PASSWORD_MIN }));
      return;
    }
    if (!meetsComplexity(newPassword)) {
      setError(t('errors.passwordTooWeak'));
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/auth/account-setup', {
        method: 'POST',
        body: { token, newPassword },
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PASSWORD_TOO_SHORT') {
          const msg =
            typeof err.body.message === 'string'
              ? err.body.message
              : t('errors.passwordTooShort', { min: PASSWORD_MIN });
          setError(msg);
        } else {
          const key = ERROR_KEYS[err.code];
          setError(key ? t(`errors.${key}` as never) : (err.message ?? t('errors.generic')));
        }
      } else {
        setError(t('errors.network'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthCard
        title={t('accountSetup.title')}
        footer={
          <Link href="/login" className="text-primary font-semibold underline">
            {t('accountSetup.backToLogin')}
          </Link>
        }
      >
        <p role="alert" className="text-sm text-danger bg-danger-bg border border-danger rounded-md px-3 py-2">
          {t('accountSetup.missingToken')}
        </p>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title={t('accountSetup.successTitle')}>
        <p className="text-sm text-foreground mb-6">{t('accountSetup.successBody')}</p>
        <Link
          href="/login"
          className="block text-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          {t('accountSetup.goToLogin')}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('accountSetup.title')}
      subtitle={t('accountSetup.subtitle')}
      footer={
        <Link href="/login" className="text-primary font-semibold underline">
          {t('accountSetup.backToLogin')}
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('accountSetup.newPassword')}
          <PasswordInput
            id="newPassword"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
          />
          <span className="text-xs font-normal text-muted-foreground">
            {t('accountSetup.passwordHint', { min: PASSWORD_MIN })}
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="text-sm text-danger bg-danger-bg border border-danger rounded-md px-3 py-2"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? t('accountSetup.submitting') : t('accountSetup.submit')}
        </button>
      </form>
    </AuthCard>
  );
}

export default function AccountSetupPage() {
  return (
    <Suspense fallback={null}>
      <AccountSetupForm />
    </Suspense>
  );
}

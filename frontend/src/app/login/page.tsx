// /login — wires the real POST /api/auth/login (frontend/src/app/api/auth/login/route.ts).
// Uses the AuthSplitLayout two-panel layout with the app's theme tokens +
// established form/error patterns (see AddStudentForm, AccountSecuritySection).
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import AuthSplitLayout from '@/components/auth/AuthSplitLayout';
import PasswordInput from '@/components/forms/PasswordInput';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

// Maps the stable `error` codes returned by POST /api/auth/login to the
// matching `auth.errors` message key. Unmapped codes fall back to err.message.
const ERROR_KEYS: Record<string, string> = {
  INVALID_CREDENTIALS: 'invalidCredentials',
  LOCKED_OUT: 'lockedOut',
  ACCOUNT_SUSPENDED: 'accountSuspended',
  TOO_MANY_LOGIN_ATTEMPTS: 'tooManyLoginAttempts',
  VALIDATION_FAILED: 'validationFailed',
};

export default function LoginPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setSubmitting(true);
    try {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
      // Full page navigation (not router.push): the login route just set the
      // auth + CSRF cookies, and AuthProvider only fetches /api/auth/me once
      // on mount. A full navigation remounts it so the Sidebar's user info
      // and every other consumer of useAuth() picks up the new session
      // immediately, instead of showing a stale logged-out state.
      window.location.assign('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          setNeedsVerification(true);
          setError(t('errors.emailNotVerified'));
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

  return (
    <AuthSplitLayout title={t('login.title')} subtitle={t('login.subtitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('login.email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-semibold text-foreground">
              {t('login.password')}
            </label>
            <Link href="/forgot-password" className="text-xs text-primary font-semibold underline">
              {t('login.forgotPassword')}
            </Link>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-danger bg-danger-bg border border-danger rounded-md px-3 py-2"
          >
            {error}
            {needsVerification && (
              <>
                {' '}
                <Link
                  href={`/verify-email?email=${encodeURIComponent(email)}`}
                  className="underline font-semibold"
                >
                  {t('login.verifyNow')}
                </Link>
              </>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link href="/signup" className="text-primary font-semibold underline">
          {t('login.createAccount')}
        </Link>
      </p>
    </AuthSplitLayout>
  );
}

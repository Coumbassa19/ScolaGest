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

      <div className="mt-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('login.orContinueWith')}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <a
        href="/api/auth/oauth/google/start?next=/dashboard"
        className="mt-4 flex items-center justify-center gap-3 rounded-full border border-border px-5 py-3 text-sm font-medium text-foreground bg-white hover:bg-input"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
          />
        </svg>
        {t('login.continueWithGoogle')}
      </a>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link href="/signup" className="text-primary font-semibold underline">
          {t('login.createAccount')}
        </Link>
      </p>
    </AuthSplitLayout>
  );
}

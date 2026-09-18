// /reset-password — wires the real POST /api/auth/reset-password
// (frontend/src/app/api/auth/reset-password/route.ts). Based on
// examples/frontend-pages/reset-password.tsx.
//
// Reads ?email= and ?code= from the URL (the reset email would link here
// with both pre-filled). No auto-login on success — a password reset bumps
// User.tokenVersion to invalidate any stolen sessions, so the user logs in
// fresh on /login.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import AuthCard from '@/components/auth/AuthCard';
import PasswordInput from '@/components/forms/PasswordInput';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

const PASSWORD_MIN = 7; // mirrors AUTH_PASSWORD_MIN_LENGTH default (see .env.local)

// Mirrors meetsPasswordComplexity() in lib/server/auth/password-policy.ts —
// duplicated here (not imported) since that module is server-only.
function meetsComplexity(pw: string): boolean {
  return /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

const ERROR_KEYS: Record<string, string> = {
  VERIFICATION_CODE_INVALID: 'verificationCodeInvalidReset',
  VERIFICATION_CODE_EXPIRED: 'verificationCodeExpiredReset',
  TOO_MANY_RESET_ATTEMPTS: 'tooManyResetAttempts',
  PASSWORD_BANNED: 'passwordBanned',
  PASSWORD_PWNED: 'passwordPwned',
  PASSWORD_TOO_WEAK: 'passwordTooWeak',
  VALIDATION_FAILED: 'validationFailedFields',
};

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('auth');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email, code, newPassword },
      });
      router.push('/login?reset=ok');
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

  return (
    <AuthCard
      title={t('resetPassword.title')}
      footer={
        <Link href="/login" className="text-primary font-semibold underline">
          {t('resetPassword.backToLogin')}
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('resetPassword.email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('resetPassword.code')}
          <input
            type="text"
            required
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            className={`${fieldClass} font-mono tracking-widest uppercase`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('resetPassword.newPassword')}
          <PasswordInput
            id="newPassword"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
          />
          <span className="text-xs font-normal text-muted-foreground">
            {t('resetPassword.passwordHint', { min: PASSWORD_MIN })}
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
          {submitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
        </button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

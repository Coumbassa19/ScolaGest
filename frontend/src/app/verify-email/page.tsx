// /verify-email — wires the real POST /api/auth/verify-email
// (frontend/src/app/api/auth/verify-email/route.ts), which is the route that
// actually issues the auth cookies (signup itself issues none — see
// CLAUDE.md's auth model). Based on examples/frontend-pages/verify-email.tsx.
//
// Reads ?email= and ?code= from the URL — a link in the verification email
// would carry both and auto-submit; the form is the fallback for manual
// 8-char code entry. Also offers a "resend code" action wired to the real
// POST /api/auth/resend-verification route.
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import AuthCard from '@/components/auth/AuthCard';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

const ERROR_KEYS: Record<string, string> = {
  VERIFICATION_CODE_INVALID: 'verificationCodeInvalid',
  VERIFICATION_CODE_EXPIRED: 'verificationCodeExpired',
  TOO_MANY_VERIFY_ATTEMPTS: 'tooManyVerifyAttempts',
  VALIDATION_FAILED: 'validationFailedFields',
};

function VerifyEmailForm() {
  const params = useSearchParams();
  const t = useTranslations('auth');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify(emailValue: string, codeValue: string) {
    setSubmitting(true);
    setError(null);
    setResent(false);
    try {
      await api('/api/auth/verify-email', {
        method: 'POST',
        body: { email: emailValue, code: codeValue },
      });
      // Full page navigation so AuthProvider remounts and picks up the
      // session the server just established (see /login for the same
      // reasoning).
      window.location.assign('/');
    } catch (err) {
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        setError(key ? t(`errors.${key}` as never) : (err.message ?? t('errors.generic')));
      } else {
        setError(t('errors.network'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Auto-submit when the link carries both params — the form below stays as
  // a fallback for manual entry.
  useEffect(() => {
    const qEmail = params.get('email');
    const qCode = params.get('code');
    if (qEmail && qCode) {
      void verify(qEmail, qCode);
    }
    // Intentionally run once on mount only — re-running on every keystroke
    // (verify/params identity changes) would re-trigger the auto-submit.
    // This project's ESLint config has no react-hooks plugin, so no
    // exhaustive-deps suppression comment is needed here.
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void verify(email, code);
  }

  async function onResend() {
    if (!email) {
      setError(t('errors.emailRequiredForResend'));
      return;
    }
    setResending(true);
    setError(null);
    setResent(false);
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email } });
      setResent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        setError(key ? t(`errors.${key}` as never) : (err.message ?? t('errors.generic')));
      } else {
        setError(t('errors.network'));
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthCard
      title={t('verifyEmail.title')}
      subtitle={t('verifyEmail.subtitle')}
      footer={
        <>
          {t('verifyEmail.problem')}{' '}
          <Link href="/signup" className="text-primary font-semibold underline">
            {t('verifyEmail.restartSignup')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('verifyEmail.email')}
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
          {t('verifyEmail.code')}
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

        {error && (
          <p
            role="alert"
            className="text-sm text-danger bg-danger-bg border border-danger rounded-md px-3 py-2"
          >
            {error}
          </p>
        )}
        {resent && !error && (
          <p className="text-sm text-success bg-success-bg border border-success rounded-md px-3 py-2">
            {t('verifyEmail.resent')}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? t('verifyEmail.submitting') : t('verifyEmail.submit')}
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={resending}
          className="text-sm text-primary font-semibold underline disabled:opacity-50 self-start"
        >
          {resending ? t('verifyEmail.resending') : t('verifyEmail.resend')}
        </button>
      </form>
    </AuthCard>
  );
}

// useSearchParams() requires a <Suspense> boundary under the App Router.
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

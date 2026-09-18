// /forgot-password — wires the real POST /api/auth/forgot-password
// (frontend/src/app/api/auth/forgot-password/route.ts). Based on
// examples/frontend-pages/forgot-password.tsx.
//
// Enumeration-resistant: the server always returns 200 { ok: true } whether
// or not the email exists, so the UI always shows the same "check your
// email" confirmation regardless.
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import AuthCard from '@/components/auth/AuthCard';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

const ERROR_KEYS: Record<string, string> = {
  TOO_MANY_FORGOT_ATTEMPTS: 'tooManyForgotAttempts',
  VALIDATION_FAILED: 'validationFailedEmail',
};

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
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

  if (submitted) {
    return (
      <AuthCard title={t('forgotPassword.checkEmailTitle')}>
        <p className="text-sm text-foreground">
          {t.rich('forgotPassword.checkEmailBody', {
            email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          <Link href="/reset-password" className="text-primary font-semibold underline">
            {t('forgotPassword.alreadyHaveCode')}
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('forgotPassword.title')}
      subtitle={t('forgotPassword.subtitle')}
      footer={
        <>
          {t('forgotPassword.rememberIt')}{' '}
          <Link href="/login" className="text-primary font-semibold underline">
            {t('forgotPassword.login')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('forgotPassword.email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
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

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? t('forgotPassword.submitting') : t('forgotPassword.submit')}
        </button>
      </form>
    </AuthCard>
  );
}

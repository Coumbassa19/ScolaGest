// /auth/error — landing page for OAuth callback failures.
//
// The callback (frontend/src/app/api/auth/oauth/google/callback/route.ts)
// builds redirects via `redirectToAuthError(code)` in
// frontend/src/lib/server/oauth/error-redirect.ts. That helper hard-codes
// `/auth/error?code=<CODE>` with the UPPERCASE codes (D-06 contract):
//   GOOGLE_EMAIL_NOT_VERIFIED
//   GOOGLE_NO_ACCOUNT
//   OAUTH_STATE_MISMATCH
//   OAUTH_CODE_EXCHANGE_FAILED
//   OAUTH_PROVIDER_DISABLED
//   OAUTH_GENERIC
//
// Unknown / missing codes fall back to a generic message.
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

const KNOWN_CODES = [
  'GOOGLE_EMAIL_NOT_VERIFIED',
  'GOOGLE_NO_ACCOUNT',
  'OAUTH_STATE_MISMATCH',
  'OAUTH_CODE_EXCHANGE_FAILED',
  'OAUTH_PROVIDER_DISABLED',
  'OAUTH_GENERIC',
] as const;

function AuthErrorBody() {
  const t = useTranslations('auth.oauthError');
  const params = useSearchParams();
  const code = params.get('code') ?? params.get('error') ?? '';
  const normalized = code.toUpperCase();
  const knownCode = KNOWN_CODES.find((c) => c === normalized);
  const message = knownCode ? t(`messages.${knownCode}`) : t('messages.unknown');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">{t('heading')}</h1>
      <p className="text-sm text-gray-700">{message}</p>
      {code && <p className="font-mono text-xs text-gray-400">{t('codeLabel', { code })}</p>}
      <div className="flex flex-col gap-2">
        {normalized === 'GOOGLE_NO_ACCOUNT' && (
          <Link
            href="/signup"
            className="rounded-md bg-black px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-800"
          >
            {t('createAccount')}
          </Link>
        )}
        <Link
          href="/login"
          className={
            normalized === 'GOOGLE_NO_ACCOUNT'
              ? 'rounded-md border border-gray-300 px-5 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50'
              : 'rounded-md bg-black px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-800'
          }
        >
          {t('backToLogin')}
        </Link>
        <Link href="/dashboard" className="text-center text-sm text-gray-600 underline">
          {t('home')}
        </Link>
      </div>
    </main>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorBody />
    </Suspense>
  );
}

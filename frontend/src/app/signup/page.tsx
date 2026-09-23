// /signup — wires POST /api/schools/signup: a school admin creates their
// School + their own account in one step and starts a 14-day free trial.
// The plan (Essentiel/Croissance) is chosen on the public pricing page and
// carried here via ?plan=; see PLANS in billing/constants.ts.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import AuthSplitLayout from '@/components/auth/AuthSplitLayout';
import PasswordInput from '@/components/forms/PasswordInput';
import {
  PLAN_CROISSANCE,
  isSchoolPlan,
  PLANS,
  type SchoolPlan,
} from '@/lib/server/billing/constants';
import { formatPrice } from '@/lib/utils';

const PASSWORD_MIN = 7; // mirrors AUTH_PASSWORD_MIN_LENGTH default (see .env.local)

// Mirrors meetsPasswordComplexity() in lib/server/auth/password-policy.ts —
// duplicated here (not imported) since that module is server-only.
function meetsComplexity(pw: string): boolean {
  return /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

const ERROR_KEYS: Record<string, string> = {
  EMAIL_TAKEN: 'emailTaken',
  PASSWORD_BANNED: 'passwordBanned',
  PASSWORD_PWNED: 'passwordPwned',
  PASSWORD_TOO_WEAK: 'passwordTooWeak',
  TOO_MANY_SIGNUP_ATTEMPTS: 'tooManySignupAttempts',
  VALIDATION_FAILED: 'validationFailed',
};

const PLAN_NAME_KEY: Record<SchoolPlan, string> = {
  ESSENTIEL: 'signup.planEssentielName',
  CROISSANCE: 'signup.planCroissanceName',
  FLEXIBLE: 'signup.planFlexibleName',
};

const PLAN_PERIOD_KEY: Record<SchoolPlan, 'signup.perYear' | 'signup.perQuarter'> = {
  ESSENTIEL: 'signup.perYear',
  CROISSANCE: 'signup.perYear',
  FLEXIBLE: 'signup.perQuarter',
};

function SignupForm() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const requestedPlan = searchParams.get('plan');
  const plan: SchoolPlan = isSchoolPlan(requestedPlan) ? requestedPlan : PLAN_CROISSANCE;
  const planPrice = PLANS[plan].priceGNF;

  const [name, setName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!schoolName.trim()) {
      setError(t('errors.schoolNameRequired'));
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(t('errors.passwordTooShort', { min: PASSWORD_MIN }));
      return;
    }
    if (!meetsComplexity(password)) {
      setError(t('errors.passwordTooWeak'));
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/schools/signup', {
        method: 'POST',
        body: { name, schoolName, email, password, plan },
      });
      // Full page navigation — same reasoning as /login: session cookies
      // were just set, and AuthProvider only reads them once on mount.
      window.location.assign('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PASSWORD_TOO_SHORT') {
          setError(t('errors.passwordTooShort', { min: PASSWORD_MIN }));
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
    <AuthSplitLayout title={t('signup.title')} subtitle={t('signup.subtitle')}>
      <div className="mb-5 flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">{t('signup.planSelected')}</p>
          <p className="text-sm font-semibold text-foreground">
            {t(PLAN_NAME_KEY[plan] as never)} — {formatPrice(planPrice, 'GNF')}
            {t(PLAN_PERIOD_KEY[plan])}
          </p>
        </div>
        <Link
          href="/#pricing"
          className="text-xs font-semibold text-primary underline whitespace-nowrap"
        >
          {t('signup.planChange')}
        </Link>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('signup.name')}
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('signup.schoolName')}
          <input
            type="text"
            required
            autoComplete="organization"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t('signup.email')}
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
          <label htmlFor="password" className="text-sm font-semibold text-foreground">
            {t('signup.password')}
          </label>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
          />
          <p className="text-xs text-muted-foreground">
            {t('signup.passwordHint', { min: PASSWORD_MIN })}
          </p>
        </div>

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
          {submitting ? t('signup.submitting') : t('signup.submit')}
        </button>

        <p className="text-xs text-muted-foreground text-center">{t('signup.terms')}</p>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('signup.haveAccount')}{' '}
        <Link href="/login" className="text-primary font-semibold underline">
          {t('signup.login')}
        </Link>
      </p>
    </AuthSplitLayout>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

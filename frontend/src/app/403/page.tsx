// /403 — landed on by requirePageAuth() when an authenticated user tries to
// reach a page their role/menu permissions don't grant (see
// src/lib/server/middleware/require-page-auth.ts). Not a security boundary
// itself — the redirect already happened server-side before this rendered.
'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import AuthCard from '@/components/auth/AuthCard';
import Icon from '@/components/global/Icon';

export default function ForbiddenPage() {
  const t = useTranslations('errors.forbidden');

  return (
    <AuthCard title={t('title')} subtitle={t('subtitle')}>
      <div className="flex flex-col items-center gap-6 py-2">
        <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center">
          <Icon i="shield-alert" size={28} className="text-danger" />
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
        >
          {t('backToDashboard')}
        </Link>
      </div>
    </AuthCard>
  );
}

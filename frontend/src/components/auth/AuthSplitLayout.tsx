// Two-panel professional layout for /login and /signup specifically — a
// brand panel (left, hidden below `lg`) + the form itself (right). Separate
// from the plain <AuthCard>, which stays as-is for the simpler utility auth
// pages (forgot-password, reset-password, verify-email, account-setup, 403)
// so this redesign doesn't touch those.
'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';

const BRAND_FEATURE_ICONS = ['users', 'file-text', 'circle-dollar-sign', 'calendar'] as const;

export default function AuthSplitLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const t = useTranslations('auth');
  const tHome = useTranslations('homepage');

  return (
    <div className="flex min-h-screen bg-background font-body">
      {/* Left — brand panel, hidden below lg */}
      <div className="hidden lg:flex w-80 bg-primary flex-col justify-between px-8 py-12 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-primary-foreground rounded-xl flex items-center justify-center p-1.5">
              <img src="/logo-icon.png" alt="ScolaGest" className="w-full h-full object-contain" />
            </div>
            <span className="text-xl font-headings font-semibold text-primary-foreground">
              {tHome('nav.brand')}
            </span>
          </div>
          <h1 className="text-2xl font-headings font-semibold text-primary-foreground leading-snug mb-4 whitespace-pre-line">
            {tHome('hero.title')}
          </h1>
          <p className="text-sm text-primary-foreground leading-relaxed" style={{ opacity: 0.8 }}>
            {t('slogan')}
          </p>
        </div>

        <div className="space-y-5">
          {BRAND_FEATURE_ICONS.map((icon, i) => (
            <div key={icon} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <Icon i={icon} size={16} className="text-primary-foreground" />
              </div>
              <span className="text-sm text-primary-foreground" style={{ opacity: 0.9 }}>
                {tHome(`features.item${i + 1}Title` as never)}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-primary-foreground" style={{ opacity: 0.45 }}>
          {tHome('footer.copyright')}
        </p>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8 md:py-12">
        <div className="w-full max-w-md">
          <div className="flex lg:hidden items-center justify-center gap-2.5 mb-8">
            <div className="w-9 h-9 bg-white border border-border rounded-md flex items-center justify-center p-1">
              <img src="/logo-icon.png" alt="ScolaGest" className="w-full h-full object-contain" />
            </div>
            <span className="text-foreground font-headings font-semibold text-lg">
              {tHome('nav.brand')}
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-headings font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>

          <div className="bg-surface border border-border rounded-2xl px-6 py-7 sm:px-8 sm:py-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

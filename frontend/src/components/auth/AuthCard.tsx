// Shared shell for the auth pages (login/signup/verify-email/forgot-password/
// reset-password). Not a pixel-match of the ScolaGest/Banani design system —
// these pages predate it and serve a universal purpose — but it reuses the
// same Tailwind v4 theme tokens from globals.css so it doesn't look jarring
// next to the rest of the app.
'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export default function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations('auth');
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-10 font-body">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-1 mb-6">
          <div className="flex items-center justify-center gap-2.5">
            <div className="w-9 h-9 bg-white border border-border rounded-md flex items-center justify-center p-1">
              <img src="/logo-icon.png" alt="ScolaGest" className="w-full h-full object-contain" />
            </div>
            <div className="text-foreground font-headings font-semibold text-lg">ScolaGest</div>
          </div>
          <div className="text-muted-foreground text-xs tracking-wide">{t('slogan')}</div>
        </div>

        <div className="bg-surface border border-border rounded-lg px-6 py-7 sm:px-8 sm:py-8">
          <h1 className="text-2xl font-headings font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}

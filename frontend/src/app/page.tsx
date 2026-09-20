import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Icon from '@/components/global/Icon';
import DemoRequestForm from '@/components/DemoRequestForm';
import { prisma } from '@/lib/server/prisma';
import { PLANS } from '@/lib/server/billing/constants';
import { formatPrice } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'ScolaGest — La gestion scolaire, simplifiée.',
  description:
    'ScolaGest est la plateforme tout-en-un pour les écoles : inscriptions, bulletins, paiements et emploi du temps, réunis dans un seul espace sécurisé.',
};

const FEATURE_ICONS = [
  'users',
  'file-text',
  'circle-dollar-sign',
  'calendar',
  'bar-chart-2',
  'shield',
] as const;

// Shared across both plan cards — the plans differ by price and student
// cap (rendered separately, at the top of each card), not by feature set.
const PRICING_FEATURE_KEYS = [
  'feature1',
  'feature2',
  'feature3',
  'feature4',
  'feature5',
  'feature6',
] as const;

// WhatsApp contact number, digits only (country code + number, no leading +).
const WHATSAPP_URL = 'https://wa.me/224623080950';

// A "trusted by" logo strip is only honest once there's a real customer
// base to show — showing fabricated or placeholder logos here would be the
// same kind of misleading trust signal as the fake testimonials that were
// removed from the original mockup. Schools opt in explicitly via
// School.featuredOnHomepage; the section stays hidden until there are
// enough of them to look like real, ongoing adoption rather than a
// single-logo placeholder.
const MIN_FEATURED_SCHOOLS_TO_SHOW = 3;

export default async function HomePage() {
  const t = await getTranslations('homepage');
  const year = new Date().getFullYear();

  const featuredSchools = await prisma.school.findMany({
    where: { featuredOnHomepage: true, logoUrl: { not: null } },
    select: { id: true, name: true, logoUrl: true },
    take: 12,
  });
  const showTrustedSchools = featuredSchools.length >= MIN_FEATURED_SCHOOLS_TO_SHOW;

  return (
    <div className="flex flex-col bg-background font-body min-h-full">
      {/* Nav lives OUTSIDE the hero's decorative wrapper on purpose: sticky
          positioning only holds an element within its own parent's box, so
          nesting it inside the (hero-height-only) wrapper below made it stop
          sticking — and un-stick — right as the hero ended. Its own bg-primary
          keeps it visually seamless with the hero. z-50 (vs. the hero's z-10)
          keeps it painted above the hero content while they overlap mid-scroll
          — same-z-index siblings paint in DOM order, and the hero comes after
          this in the markup, so without a higher z-index it would draw over
          the nav instead of staying tucked behind it. */}
      <nav className="sticky top-0 z-50 bg-primary px-4 py-4 md:px-8">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-foreground rounded-lg flex items-center justify-center">
              <Icon i="graduation-cap" size={20} className="text-primary" />
            </div>
            <span className="text-lg font-headings font-semibold text-primary-foreground tracking-wide">
              {t('nav.brand')}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-semibold text-primary-foreground">
              {t('nav.features')}
            </a>
            <a href="#pricing" className="text-sm font-semibold text-primary-foreground">
              {t('nav.pricing')}
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-success rounded-full"
            >
              <Icon i="message-circle" size={16} />
              {t('nav.whatsapp')}
            </a>
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-accent-foreground bg-accent rounded-full"
            >
              {t('nav.login')}
            </Link>
          </div>
          <div className="flex md:hidden items-center gap-2">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('nav.whatsapp')}
              className="w-9 h-9 flex items-center justify-center bg-success rounded-full text-white"
            >
              <Icon i="message-circle" size={16} />
            </a>
            <Link
              href="/login"
              className="px-3 py-1.5 text-xs font-semibold text-accent-foreground bg-accent rounded-full"
            >
              {t('nav.login')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero's own dark backdrop, seamless with the nav above it. */}
      <div className="relative bg-primary">
        {/* Decorative glow + line texture — no external image asset exists
            for this, so the "photo de fond" effect is built from layered
            CSS gradients instead of a fabricated stock photo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 20%, rgba(201,168,76,0.18), transparent 45%),' +
              'radial-gradient(circle at 85% 15%, rgba(255,255,255,0.10), transparent 40%),' +
              'radial-gradient(circle at 75% 85%, rgba(201,168,76,0.12), transparent 45%)',
          }}
        />
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.08]"
          preserveAspectRatio="none"
          viewBox="0 0 1200 800"
        >
          {[80, 200, 340, 480, 620].map((y, i) => (
            <path
              key={y}
              d={`M -100 ${y} C 300 ${y - 80}, 700 ${y + 100}, 1300 ${y - 40}`}
              stroke="white"
              strokeWidth={1}
              fill="none"
              opacity={1 - i * 0.12}
            />
          ))}
        </svg>

        {/* HERO */}
        <section className="relative z-10 px-4 py-14 md:px-8 md:py-20">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center">
            <div>
              <h1 className="text-3xl md:text-5xl font-headings font-semibold text-primary-foreground leading-tight mb-6 whitespace-pre-line">
                {t('hero.title')}
              </h1>
              <p
                className="text-base md:text-lg text-primary-foreground leading-relaxed mb-8"
                style={{ opacity: 0.85 }}
              >
                {t('hero.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <Link
                  href="/signup"
                  className="px-6 py-3 bg-accent text-accent-foreground font-semibold text-base rounded-lg text-center"
                >
                  {t('hero.ctaPrimary')}
                </Link>
                <Link
                  href="/login"
                  className="px-6 py-3 text-primary-foreground font-semibold text-base border border-primary-foreground rounded-lg flex items-center justify-center gap-2"
                  style={{ borderColor: 'rgba(255,255,255,0.5)' }}
                >
                  <Icon i="log-in" size={18} />
                  {t('hero.ctaSecondary')}
                </Link>
              </div>
              <p className="text-xs text-primary-foreground mt-6" style={{ opacity: 0.7 }}>
                {t('hero.trust')}
              </p>
            </div>

            {/* Illustrative dashboard panel, framed like a tablet — a real
                representation of the product's own dashboard layout, not a
                fabricated screenshot. */}
            <div className="mx-auto w-full max-w-md">
              <div className="bg-[#0d1b2e] rounded-[28px] p-3 shadow-2xl">
                <div className="bg-surface rounded-2xl p-5 md:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t('heroPanel.title')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-danger" />
                      <span className="w-2 h-2 rounded-full bg-warning" />
                      <span className="w-2 h-2 rounded-full bg-success" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-background border border-border rounded-xl p-4">
                      <div className="w-8 h-8 bg-secondary rounded-md flex items-center justify-center mb-3">
                        <Icon i="circle-dollar-sign" size={16} className="text-accent" />
                      </div>
                      <p className="text-xs text-muted-foreground">{t('heroPanel.revenueLabel')}</p>
                      <p className="text-lg font-headings font-semibold text-foreground mt-0.5">
                        4 250 000 GNF
                      </p>
                    </div>
                    <div className="bg-background border border-border rounded-xl p-4">
                      <div className="w-8 h-8 bg-secondary rounded-md flex items-center justify-center mb-3">
                        <Icon i="users" size={16} className="text-primary" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('heroPanel.studentsLabel')}
                      </p>
                      <p className="text-lg font-headings font-semibold text-foreground mt-0.5">
                        312
                      </p>
                    </div>
                    <div className="bg-background border border-border rounded-xl p-4">
                      <div className="w-8 h-8 bg-secondary rounded-md flex items-center justify-center mb-3">
                        <Icon i="book-open" size={16} className="text-success" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('heroPanel.scheduleLabel')}
                      </p>
                      <p className="text-lg font-headings font-semibold text-foreground mt-0.5">
                        48
                      </p>
                    </div>
                    <div className="bg-background border border-border rounded-xl p-4">
                      <div className="w-8 h-8 bg-secondary rounded-md flex items-center justify-center mb-3">
                        <Icon i="clock" size={16} className="text-warning" />
                      </div>
                      <p className="text-xs text-muted-foreground">{t('heroPanel.pendingLabel')}</p>
                      <p className="text-lg font-headings font-semibold text-foreground mt-0.5">
                        620 000 GNF
                      </p>
                    </div>
                  </div>
                  <div className="bg-background border border-border rounded-xl p-4 flex items-end gap-2 h-24">
                    {[40, 65, 50, 80, 60, 95].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-primary rounded-t-sm"
                        style={{ height: `${h}%`, opacity: i === 5 ? 1 : 0.35 }}
                      />
                    ))}
                  </div>
                </div>
                {/* Tablet camera dot, bottom-right — matches the physical
                    bezel of a real tablet frame. */}
                <div className="flex justify-end pr-2 pt-2">
                  <span className="w-2 h-2 rounded-full bg-[#33455c]" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* FEATURES */}
      <section
        id="features"
        className="px-4 py-16 md:px-8 md:py-24 bg-surface border-t border-border"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl font-headings font-semibold text-foreground mb-4">
              {t('features.title')}
            </h2>
            <p className="text-base md:text-lg text-muted-foreground">{t('features.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURE_ICONS.map((icon, i) => {
              const n = i + 1;
              return (
                <div key={icon} className="bg-background border border-border rounded-xl p-6">
                  <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center mb-4">
                    <Icon i={icon} size={24} className="text-primary" />
                  </div>
                  <h3 className="text-lg font-headings font-semibold text-foreground mb-2">
                    {t(`features.item${n}Title` as never)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t(`features.item${n}Desc` as never)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="px-4 py-16 md:px-8 md:py-24 bg-background">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl font-headings font-semibold text-foreground mb-4">
              {t('pricing.title')}
            </h2>
            <p className="text-base md:text-lg text-muted-foreground">{t('pricing.subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
            {/* Forfait Essentiel — écoles primaires uniquement / petits effectifs */}
            <div className="bg-surface border border-border rounded-2xl p-8 md:p-10">
              <div className="mb-6">
                <h3 className="text-2xl font-headings font-semibold text-foreground">
                  {t('pricing.essentiel.name')}
                </h3>
                <p className="text-sm mt-1 text-muted-foreground">
                  {t('pricing.essentiel.tagline')}
                </p>
              </div>
              <div className="mb-6 pb-6 border-b border-border">
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-3xl md:text-4xl font-headings font-semibold text-foreground">
                    {formatPrice(PLANS.ESSENTIEL.priceGNF, 'GNF')}
                  </span>
                  <span className="pb-1 text-muted-foreground">{t('pricing.pricePeriod')}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t('pricing.trialNote')}</p>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <Icon i="check" size={16} className="flex-shrink-0 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {t('pricing.essentiel.studentLimit')}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {PRICING_FEATURE_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Icon i="check" size={16} className="flex-shrink-0 text-primary" />
                    <span className="text-sm text-foreground">{t(`pricing.${key}`)}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/signup?plan=ESSENTIEL"
                className="block w-full py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-lg text-center"
              >
                {t('pricing.essentiel.cta')}
              </Link>
            </div>

            {/* Forfait Croissance — le plus populaire, élèves illimités */}
            <div className="relative bg-primary text-primary-foreground rounded-2xl p-8 md:p-10 shadow-xl md:-mt-4">
              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-xs font-semibold px-4 py-1.5 rounded-full whitespace-nowrap">
                {t('pricing.mostPopular')}
              </span>
              <div className="mb-6">
                <h3 className="text-2xl font-headings font-semibold">
                  {t('pricing.croissance.name')}
                </h3>
                <p className="text-sm mt-1" style={{ opacity: 0.8 }}>
                  {t('pricing.croissance.tagline')}
                </p>
              </div>
              <div className="mb-6 pb-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-3xl md:text-4xl font-headings font-semibold">
                    {formatPrice(PLANS.CROISSANCE.priceGNF, 'GNF')}
                  </span>
                  <span className="pb-1" style={{ opacity: 0.8 }}>
                    {t('pricing.pricePeriod')}
                  </span>
                </div>
                <p className="text-xs" style={{ opacity: 0.7 }}>
                  {t('pricing.trialNote')}
                </p>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <Icon i="check" size={16} className="flex-shrink-0" />
                <span className="text-sm font-semibold">
                  {t('pricing.croissance.studentLimit')}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {PRICING_FEATURE_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Icon i="check" size={16} className="flex-shrink-0" />
                    <span className="text-sm">{t(`pricing.${key}`)}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/signup?plan=CROISSANCE"
                className="block w-full py-3 bg-primary-foreground text-primary font-semibold text-sm rounded-lg text-center"
              >
                {t('pricing.croissance.cta')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* TRUSTED SCHOOLS — hidden until real, opted-in schools exist. Styled
          as an auto-scrolling logo marquee (full color, paused on hover,
          duplicated set for a seamless loop) rather than the earlier static
          grayscale strip, matching the "trusted by" pattern used by other
          school-management sites. */}
      {showTrustedSchools && (
        <section className="px-4 py-16 md:px-8 md:py-20 bg-muted overflow-hidden">
          <div className="max-w-7xl mx-auto text-center mb-10 md:mb-12">
            {/* Same size/weight as the pricing H2 ("Un tarif adapté...") —
                this section deserves the same visual weight, not a small
                muted eyebrow label. */}
            <h2 className="text-2xl md:text-4xl font-headings font-semibold text-foreground mb-4">
              {t('trustedSchools.title')}
            </h2>
            <p className="text-base md:text-lg text-muted-foreground">
              {t('trustedSchools.subtitle')}
            </p>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 md:w-24 bg-gradient-to-r from-muted to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 md:w-24 bg-gradient-to-l from-muted to-transparent" />
            <div className="flex w-max gap-6 animate-scroll-logos hover:[animation-play-state:paused] motion-reduce:animate-none md:gap-8">
              {[...featuredSchools, ...featuredSchools].map((school, i) => (
                <div
                  key={`${school.id}-${i}`}
                  aria-hidden={i >= featuredSchools.length}
                  className="flex min-w-[190px] shrink-0 items-center justify-center rounded-xl border border-border bg-surface px-7 py-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:min-w-[230px]"
                >
                  {/* External/opted-in logo URLs, not a local optimizable asset. */}
                  <img
                    src={school.logoUrl!}
                    alt={school.name}
                    className="h-16 w-auto max-w-[170px] object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA FINAL + DEMO REQUEST — one section, two halves split by a
          vertical divider: the existing signup CTA (blue, unchanged) on the
          left, and a WhatsApp-based demo request form (gold — the same
          accent already used by the hero's "Essayer gratuitement" button and
          the logo mark) on the right. Stacks to one column on mobile, where
          the divider (a side border, meaningless once stacked) disappears. */}
      <section className="grid grid-cols-1 md:grid-cols-2">
        <div className="flex items-center justify-center bg-primary px-4 py-16 text-primary-foreground md:border-r md:border-primary-foreground/15 md:px-12 md:py-20">
          <div className="w-full max-w-md text-center md:text-left">
            <h2 className="text-2xl md:text-4xl font-headings font-semibold mb-4">
              {t('finalCta.title')}
            </h2>
            <p className="text-base md:text-lg mb-8" style={{ opacity: 0.9 }}>
              {t('finalCta.subtitle')}
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 bg-primary-foreground text-primary font-headings font-semibold text-lg rounded-lg"
            >
              {t('finalCta.cta')}
            </Link>
          </div>
        </div>
        <div className="flex items-center justify-center bg-accent px-4 py-16 md:px-12 md:py-20">
          <div className="w-full max-w-md text-center md:text-left">
            <h2 className="text-2xl md:text-4xl font-headings font-semibold text-accent-foreground mb-4">
              {t('demoForm.title')}
            </h2>
            <p
              className="text-base md:text-lg text-accent-foreground mb-8"
              style={{ opacity: 0.85 }}
            >
              {t('demoForm.subtitle')}
            </p>
            <DemoRequestForm />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border px-4 py-10 md:px-8 bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Icon i="graduation-cap" size={16} className="text-primary-foreground" />
                </div>
                <span className="font-semibold text-foreground">{t('nav.brand')}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('footer.tagline')}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                {t('footer.productTitle')}
              </p>
              <div className="space-y-2">
                <a href="#features" className="block text-xs text-muted-foreground">
                  {t('nav.features')}
                </a>
                <a href="#pricing" className="block text-xs text-muted-foreground">
                  {t('nav.pricing')}
                </a>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                {t('footer.accountTitle')}
              </p>
              <div className="space-y-2">
                <Link href="/login" className="block text-xs text-muted-foreground">
                  {t('footer.login')}
                </Link>
                <Link href="/signup" className="block text-xs text-muted-foreground">
                  {t('footer.signup')}
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">{t('footer.copyright', { year })}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

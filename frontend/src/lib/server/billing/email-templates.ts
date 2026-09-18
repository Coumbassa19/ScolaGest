// Billing-domain email templates — kept separate from
// src/lib/server/auth/email-templates.ts (auth-domain) even though the
// style mirrors it exactly (same EmailLocale/EmailTemplate shape, same
// htmlEscape/resolveLocale helpers) since this is a different concern.
import 'server-only';
import { formatPrice } from '@/lib/utils';

export type EmailLocale = 'fr' | 'en';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface SubscriptionReminderEmailArgs {
  schoolName: string;
  /** Already-formatted, locale-appropriate date string (e.g. "3 octobre 2026"). */
  expiresOnLabel: string;
  /** Full https://…/billing link. */
  billingUrl: string;
  /** Whether this is a trial ending or a paid period ending. */
  kind: 'trial' | 'subscription';
  /** Actual number of days left at send time (drives subject/body wording — not the milestone that triggered it, so catch-up sends stay accurate). */
  daysRemaining: number;
  /** The school's own plan price (School.plan → PLANS[plan].priceGNF) — ESSENTIEL and CROISSANCE are billed differently. */
  amountGNF: number;
  locale?: string;
}

function resolveLocale(locale: string | undefined): EmailLocale {
  return locale === 'en' ? 'en' : 'fr';
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function subscriptionReminderEmail(args: SubscriptionReminderEmailArgs): EmailTemplate {
  const locale = resolveLocale(args.locale);
  const schoolName = htmlEscape(args.schoolName);
  const expiresOn = htmlEscape(args.expiresOnLabel);
  const url = htmlEscape(args.billingUrl);

  if (locale === 'fr') {
    const periodWording =
      args.kind === 'trial' ? "votre essai gratuit se termine" : 'votre abonnement se termine';
    const daysWording = `dans ${args.daysRemaining} jour${args.daysRemaining === 1 ? '' : 's'}`;
    const amountLabel = formatPrice(args.amountGNF, 'GNF');
    return {
      subject: `${args.schoolName} — votre ${args.kind === 'trial' ? 'essai' : 'abonnement'} ScolaGest expire ${daysWording}`,
      html: `<p>Bonjour,</p><p>Pour <strong>${schoolName}</strong>, ${periodWording} le <strong>${expiresOn}</strong> (${daysWording}).</p><p>Pour éviter toute interruption d'accès à ScolaGest, pensez à régler l'abonnement annuel (${amountLabel}) dès maintenant.</p><p><a href="${url}">Payer mon abonnement</a></p><p>Si c'est déjà fait, ignore cet email.</p>`,
      text: `Pour ${args.schoolName}, ${periodWording} le ${expiresOn} (${daysWording}). Pour éviter toute interruption d'accès à ScolaGest, règle l'abonnement annuel (${amountLabel}) ici : ${args.billingUrl}. Si c'est déjà fait, ignore cet email.`,
    };
  }

  const periodWordingEn = args.kind === 'trial' ? 'your free trial ends' : 'your subscription ends';
  const daysWordingEn = `in ${args.daysRemaining} day${args.daysRemaining === 1 ? '' : 's'}`;
  const amountLabelEn = formatPrice(args.amountGNF, 'GNF');
  return {
    subject: `${args.schoolName} — your ScolaGest ${args.kind === 'trial' ? 'trial' : 'subscription'} expires ${daysWordingEn}`,
    html: `<p>Hi,</p><p>For <strong>${schoolName}</strong>, ${periodWordingEn} on <strong>${expiresOn}</strong> (${daysWordingEn}).</p><p>To avoid any interruption of access to ScolaGest, please pay the annual subscription (${amountLabelEn}) soon.</p><p><a href="${url}">Pay my subscription</a></p><p>If you've already paid, ignore this email.</p>`,
    text: `For ${args.schoolName}, ${periodWordingEn} on ${expiresOn} (${daysWordingEn}). To avoid any interruption of access to ScolaGest, pay the annual subscription (${amountLabelEn}) here: ${args.billingUrl}. If you've already paid, ignore this email.`,
  };
}

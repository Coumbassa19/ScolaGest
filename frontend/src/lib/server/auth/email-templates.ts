// Source: RESEARCH.md Pattern 19 — D-15/D-16 email template factories.
// Bilingual FR/EN (FR default, matching the app's DEFAULT_LOCALE) — the
// `locale` arg is threaded from the outbox event payload, itself captured
// from the requester's locale cookie at the point the forgot-password /
// resend-verification / signup route runs (see src/i18n/locale.ts).
// Plain HTML (per D-16) — no MJML / React Email; per-project may swap.
//
// Phase 5's email-queue cron consumes outbox `email.*` events and calls these
// factories to produce the EmailJob row. Phase 1 just defines the factories
// and emits the outbox events.
//
// WR-03 — Defense-in-depth: ALL interpolated values in HTML strings MUST
// flow through `htmlEscape()`. The verification code is currently constrained
// to `[A-Z2-9]{8}` upstream (VERIFICATION_CODE_REGEX), so XSS is impossible
// today. But the function signature accepts `string` and future templates
// (e.g. password-changed notifications including the user's display name)
// will reuse this pattern — escape at the source so a careless add can't
// inject HTML. Plain-text body has no HTML interpretation, so no escape
// needed there.
//
// O1 audit fix — `expiresAt` is now threaded from the outbox payload so the
// rendered TTL matches `AUTH_VERIFICATION_TTL_MIN` (was hardcoded "15 minutes"
// which lied when operators tuned the env var).
import 'server-only';

export type EmailLocale = 'fr' | 'en';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface VerificationEmailArgs {
  code: string;
  email: string;
  /** Optional ISO-8601 expiry; falls back to "soon" wording when omitted. */
  expiresAt?: string;
  /** Defaults to 'fr' (the app's DEFAULT_LOCALE) when omitted. */
  locale?: string;
}

export interface ResetPasswordEmailArgs {
  code: string;
  email: string;
  /** Optional ISO-8601 expiry; falls back to "soon" wording when omitted. */
  expiresAt?: string;
  /** Defaults to 'fr' (the app's DEFAULT_LOCALE) when omitted. */
  locale?: string;
}

export interface AccountSetupEmailArgs {
  /** Full https://…/account-setup?token=… link — already built by the caller. */
  setupUrl: string;
  /** Display name to greet, e.g. "Fatoumata Diallo". Falls back to a generic greeting when omitted. */
  name?: string;
  /** Human label for the role being granted, e.g. "Enseignant" / "Direction". */
  roleLabel: string;
  /** Optional ISO-8601 expiry; falls back to "soon" wording when omitted. */
  expiresAt?: string;
  /** Defaults to 'fr' (the app's DEFAULT_LOCALE) when omitted. */
  locale?: string;
}

function resolveLocale(locale: string | undefined): EmailLocale {
  return locale === 'en' ? 'en' : 'fr';
}

/**
 * Minimal HTML escape for template interpolation. Covers the OWASP-recommended
 * five-character set (`& < > " '`). Apply to EVERY user-controlled (or
 * potentially user-controlled) value before interpolating into an HTML
 * template string.
 */
function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the TTL window as "in N minutes" / "dans N minutes" — rounds to the
 * unit the user would actually read. Falls back to a vague "soon" / "bientôt"
 * when no timestamp is provided or the parse fails (defensive: a malformed
 * payload should never break email rendering).
 *
 * Bias rounding toward the FLOOR so we never overstate the TTL: telling a
 * user "in 15 minutes" when 14m59s remain (and the code is about to expire)
 * leads to a frustrating retry loop. Floor it to "in 14 minutes" — they may
 * be earlier than promised, never later.
 */
function ttlWording(expiresAtIso: string | undefined, locale: EmailLocale): string {
  const soon = locale === 'fr' ? 'bientôt' : 'soon';
  if (!expiresAtIso) return soon;
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs)) return soon;
  const remainingMs = expiresMs - Date.now();
  if (remainingMs <= 0) return soon; // expired by the time we render; pre-cron drift
  const minutes = Math.floor(remainingMs / 60_000);

  if (locale === 'fr') {
    if (minutes < 1) return "dans moins d'une minute";
    if (minutes < 60) return `dans ${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.floor(minutes / 60);
    return `dans ${hours} heure${hours === 1 ? '' : 's'}`;
  }

  if (minutes < 1) return 'in less than a minute';
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  return `in ${hours} hour${hours === 1 ? '' : 's'}`;
}

export function verificationEmail(args: VerificationEmailArgs): EmailTemplate {
  const locale = resolveLocale(args.locale);
  const code = htmlEscape(args.code);
  const ttl = ttlWording(args.expiresAt, locale);

  if (locale === 'fr') {
    return {
      subject: 'Vérifiez votre adresse email',
      html: `<p>Bonjour,</p><p>Votre code de vérification est <strong>${code}</strong>.</p><p>Il expire ${ttl}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
      text: `Votre code de vérification est ${args.code}. Il expire ${ttl}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    };
  }

  return {
    subject: 'Verify your email',
    html: `<p>Hi,</p><p>Your verification code is <strong>${code}</strong>.</p><p>It expires ${ttl}. If you did not request this, ignore this email.</p>`,
    text: `Your verification code is ${args.code}. It expires ${ttl}. If you did not request this, ignore this email.`,
  };
}

export function resetPasswordEmail(args: ResetPasswordEmailArgs): EmailTemplate {
  const locale = resolveLocale(args.locale);
  const code = htmlEscape(args.code);
  const ttl = ttlWording(args.expiresAt, locale);

  if (locale === 'fr') {
    return {
      subject: 'Réinitialisation de votre mot de passe',
      html: `<p>Bonjour,</p><p>Votre code de réinitialisation de mot de passe est <strong>${code}</strong>.</p><p>Il expire ${ttl}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé.</p>`,
      text: `Votre code de réinitialisation de mot de passe est ${args.code}. Il expire ${ttl}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé.`,
    };
  }

  return {
    subject: 'Reset your password',
    html: `<p>Hi,</p><p>Your password reset code is <strong>${code}</strong>.</p><p>It expires ${ttl}. If you did not request this, ignore this email — your password stays unchanged.</p>`,
    text: `Your password reset code is ${args.code}. It expires ${ttl}. If you did not request this, ignore this email — your password stays unchanged.`,
  };
}

export function accountSetupEmail(args: AccountSetupEmailArgs): EmailTemplate {
  const locale = resolveLocale(args.locale);
  const url = htmlEscape(args.setupUrl);
  const roleLabel = htmlEscape(args.roleLabel);
  const greeting = args.name ? htmlEscape(args.name) : null;
  const ttl = ttlWording(args.expiresAt, locale);

  if (locale === 'fr') {
    return {
      subject: 'Votre compte ScolaGest a été créé',
      html: `<p>Bonjour${greeting ? ` ${greeting}` : ''},</p><p>Un compte <strong>${roleLabel}</strong> vient d'être créé pour vous sur ScolaGest.</p><p><a href="${url}">Cliquez ici pour créer votre mot de passe et accéder à votre compte</a>.</p><p>Ce lien expire ${ttl}. Si vous ne vous attendiez pas à cet email, vous pouvez l'ignorer — aucun accès n'est possible sans avoir cliqué ce lien.</p>`,
      text: `Un compte ${args.roleLabel} vient d'être créé pour vous sur ScolaGest. Créez votre mot de passe ici : ${args.setupUrl} (lien valable ${ttl}). Si vous ne vous attendiez pas à cet email, vous pouvez l'ignorer.`,
    };
  }

  return {
    subject: 'Your ScolaGest account was created',
    html: `<p>Hi${greeting ? ` ${greeting}` : ''},</p><p>A <strong>${roleLabel}</strong> account was just created for you on ScolaGest.</p><p><a href="${url}">Click here to set your password and access your account</a>.</p><p>This link expires ${ttl}. If you weren't expecting this email, you can ignore it — no access is possible without clicking this link.</p>`,
    text: `A ${args.roleLabel} account was just created for you on ScolaGest. Set your password here: ${args.setupUrl} (link valid ${ttl}). If you weren't expecting this email, you can ignore it.`,
  };
}

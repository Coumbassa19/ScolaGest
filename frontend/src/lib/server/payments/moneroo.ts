/**
 * Moneroo provider — hosted checkout charges + webhook signature verification.
 *
 * Moneroo is a payment aggregator covering West/Central Africa. For Guinea
 * (GNF) it natively routes to Orange Money Guinée and MTN MoMo Guinée — no
 * separate CinetPay integration is needed; Moneroo's hosted checkout page
 * presents whichever channels are valid for the requested currency.
 *
 * Replaces the earlier Bictorys integration: Bictorys' Guinea/GNF coverage
 * was never confirmed (it was built and verified for Senegal only), and
 * Bictorys has been going through an unresolved settlement crisis since a
 * September 2025 cyberattack — see project chat history for sourcing.
 *
 * One API key (MONEROO_SECRET_KEY) — no separate charge/payout split like
 * Bictorys had, because payouts are not implemented here (the app never
 * called Bictorys' payout() from a route either — see Withdrawal model).
 *
 * Webhook signature: HMAC-SHA256 of the raw request body, using
 * MONEROO_WEBHOOK_SECRET, compared against the `X-Moneroo-Signature` header.
 *
 * Dev escape hatch: when `process.env.SMOKE_BYPASS_WEBHOOK_VERIFY === '1'`,
 * `verifySignature` returns `{ valid: true }` regardless. **DEV ONLY** — a
 * loud warning is logged on every bypass.
 */
import crypto from 'node:crypto';
import { createLogger } from '../logger';
import type { WebhookProvider, ParsedIds } from '../webhook/handler';
import type {
  PaymentProvider,
  ChargeInput,
  ChargeResult,
  RefundInput,
  RefundResult,
} from './provider';

const logger = createLogger();

// ───────────────────────────────────────────────────────────────────────
// Env shape
// ───────────────────────────────────────────────────────────────────────

export interface MonerooEnv {
  /** Secret key — backend-only, sent as `Authorization: Bearer <key>`. */
  MONEROO_SECRET_KEY: string;
  /** Base API URL. Defaults to "https://api.moneroo.io/v1". */
  MONEROO_API_URL?: string | undefined;
  /** HMAC secret paired with the receiver in /api/webhooks/moneroo. */
  MONEROO_WEBHOOK_SECRET: string;
}

// ───────────────────────────────────────────────────────────────────────
// Webhook payload
// ───────────────────────────────────────────────────────────────────────

export interface MonerooWebhookPayload {
  /** e.g. "payment.success" | "payment.failed" | "payment.cancelled" | "payment.pending" | "payment.initiated". */
  event?: string;
  data?: {
    id?: string;
    amount?: number;
    currency?: string;
    status?: string;
    customer?: {
      id?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ───────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────

const HTTP_TIMEOUT_MS = 30_000;

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Splits a display name into Moneroo's required first_name/last_name pair. */
function splitName(
  name: string | undefined,
  emailFallback: string,
): { first: string; last: string } {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    const first = parts[0]!;
    const last = parts.length > 1 ? parts.slice(1).join(' ') : first;
    return { first, last };
  }
  const local = emailFallback.split('@')[0] || 'Client';
  return { first: local, last: local };
}

function classifyEvent(event: string | undefined): 'paid' | 'failed' | 'refunded' | 'other' {
  const e = String(event ?? '').toLowerCase();
  if (e === 'payment.success') return 'paid';
  if (e === 'payment.failed' || e === 'payment.cancelled') return 'failed';
  if (e.includes('refund')) return 'refunded';
  return 'other';
}

// ───────────────────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────────────────

export interface MonerooProviderHandle extends PaymentProvider {
  webhookProvider: WebhookProvider<MonerooWebhookPayload>;
}

export function createMonerooProvider(env: MonerooEnv): MonerooProviderHandle {
  if (!env.MONEROO_SECRET_KEY)
    throw new Error('createMonerooProvider: MONEROO_SECRET_KEY is required');
  if (!env.MONEROO_WEBHOOK_SECRET)
    throw new Error('createMonerooProvider: MONEROO_WEBHOOK_SECRET is required');

  // `||`, not `??` — an empty string (e.g. an unset-but-defined Vercel env
  // var) must fall back too, not just `undefined`/`null`. `??` alone let a
  // blank MONEROO_API_URL silently produce a broken base URL in production.
  const baseUrl = (env.MONEROO_API_URL || 'https://api.moneroo.io/v1').replace(/\/+$/, '');

  // ── charge ─────────────────────────────────────────────────────────
  async function charge(input: ChargeInput): Promise<ChargeResult> {
    if (!input.customer.email) {
      throw new Error('Moneroo charge requires customer.email');
    }
    const { first, last } = splitName(input.customer.name, input.customer.email);

    const metadata: Record<string, string> = {};
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        metadata[k] = String(v);
      }
    }

    const body: Record<string, unknown> = {
      amount: input.amount,
      currency: input.currency,
      description: (input.metadata?.description as string | undefined) ?? 'ScolaGest',
      customer: {
        email: input.customer.email,
        first_name: first,
        last_name: last,
        ...(input.customer.phone ? { phone: input.customer.phone } : {}),
      },
      return_url: input.successUrl,
      metadata,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/payments/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MONEROO_SECRET_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Moneroo network error: ${msg}`);
    }
    clearTimeout(timer);

    const text = await res.text();
    let json: { message?: string; data?: { id?: string; checkout_url?: string } } | undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      throw new Error(`Moneroo returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      throw new Error(
        `Moneroo charge failed: HTTP ${res.status} — ${json?.message ?? text.slice(0, 200)}`,
      );
    }

    const providerChargeId = json?.data?.id ?? '';
    if (!providerChargeId) {
      throw new Error('Moneroo returned no payment id');
    }
    const paymentUrl = json?.data?.checkout_url ?? '';
    return { providerChargeId, paymentUrl, status: 'PENDING' };
  }

  // ── refund (not confirmed on Moneroo's public API at time of writing) ──
  async function refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error('Refund not supported by Moneroo provider');
  }

  // ── webhook provider ──────────────────────────────────────────────
  const webhookProvider: WebhookProvider<MonerooWebhookPayload> = {
    name: 'moneroo',

    verifySignature(rawBody, headers) {
      if (process.env.SMOKE_BYPASS_WEBHOOK_VERIFY === '1') {
        logger.warn(
          '[moneroo] !! SMOKE_BYPASS_WEBHOOK_VERIFY=1 — webhook signature ACCEPTED unconditionally. NEVER set this in production.',
        );
        return { valid: true };
      }

      const sig = headers['x-moneroo-signature'];
      if (!sig) return { valid: false, reason: 'no x-moneroo-signature header' };

      const expected = crypto
        .createHmac('sha256', env.MONEROO_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');
      if (timingSafeStringEqual(sig, expected)) {
        return { valid: true };
      }
      return { valid: false, reason: 'HMAC mismatch' };
    },

    parsePayload(rawBody) {
      return JSON.parse(rawBody.toString('utf8')) as MonerooWebhookPayload;
    },

    extractIds(payload): ParsedIds {
      const externalId = String(payload.data?.id ?? '');
      const eventType = String(payload.event ?? 'unknown');
      const kind = classifyEvent(payload.event);
      return { externalId, eventType, kind };
    },
  };

  return { name: 'moneroo', charge, refund, webhookProvider };
}

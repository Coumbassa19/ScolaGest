// Lazy-initialized Moneroo provider + module-level CircuitBreaker (D-PAY-02 + Pitfall 7).
//
// Why lazy?
//   `createMonerooProvider({...})` throws synchronously if MONEROO_SECRET_KEY
//   or MONEROO_WEBHOOK_SECRET is missing (see moneroo.ts). Calling it at
//   module top-level inside a route would crash the route-module on import —
//   every POST /api/orders would then return 500 with no useful error.
//
//   This module instead exposes `getProvider()` which constructs the provider
//   on first call, caches it for subsequent calls, and throws a typed
//   `PaymentProviderUnconfiguredError` if env is missing. The route catches
//   that error and returns a clean 503 PAYMENT_PROVIDER_UNCONFIGURED.
//
// Why a single shared CircuitBreaker?
//   The breaker holds in-memory failure-counter state. Re-instantiating it
//   per request would defeat its purpose. Sharing it at module scope is by
//   design — see CLAUDE.md "single-instance only" note for the in-memory
//   breaker. For multi-pod deployments swap for a Redis-backed variant.
import 'server-only';
import { createMonerooProvider, type MonerooProviderHandle } from '@/lib/server/payments/moneroo';
import { CircuitBreaker } from '@/lib/server/payments/circuit-breaker';

/**
 * Thrown by `getProvider()` when MONEROO_SECRET_KEY or MONEROO_WEBHOOK_SECRET
 * is missing/empty. The orders/billing routes should catch this `instanceof`
 * and return 503 PAYMENT_PROVIDER_UNCONFIGURED.
 */
export class PaymentProviderUnconfiguredError extends Error {
  constructor() {
    super('Payment provider not configured (MONEROO_SECRET_KEY/_WEBHOOK_SECRET missing or empty)');
    this.name = 'PaymentProviderUnconfiguredError';
  }
}

let _provider: MonerooProviderHandle | null = null;

/**
 * Lazy-init singleton accessor. First call reads `process.env`, constructs
 * the Moneroo provider, and caches the handle. Subsequent calls reuse the
 * cached instance. Throws `PaymentProviderUnconfiguredError` if any required
 * env var is missing — the route translates that to 503.
 */
export function getProvider(): MonerooProviderHandle {
  if (_provider) return _provider;

  const secretKey = process.env.MONEROO_SECRET_KEY ?? '';
  const webhookSecret = process.env.MONEROO_WEBHOOK_SECRET ?? '';

  if (!secretKey || !webhookSecret) {
    throw new PaymentProviderUnconfiguredError();
  }

  _provider = createMonerooProvider({
    MONEROO_SECRET_KEY: secretKey,
    MONEROO_API_URL: process.env.MONEROO_API_URL,
    MONEROO_WEBHOOK_SECRET: webhookSecret,
  });
  return _provider;
}

/**
 * Module-level CircuitBreaker — single-instance only per CLAUDE.md.
 * D-PAY-02 hard-codes the thresholds:
 *   - failureThreshold = 5 failures within
 *   - windowMs = 30 000 (30s rolling window)
 *   - cooldownMs = 60 000 (open → half-open delay)
 */
export const breaker = new CircuitBreaker({
  name: 'moneroo.charge',
  failureThreshold: 5,
  windowMs: 30_000,
  cooldownMs: 60_000,
});

/**
 * Test-only escape hatch — clears the cached provider so a test can mutate
 * `process.env.MONEROO_*` and re-trigger lazy init. Never call this from
 * application code.
 *
 * @internal
 */
export function __resetProviderSingleton(): void {
  _provider = null;
}

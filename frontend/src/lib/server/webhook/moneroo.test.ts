import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  getMonerooWebhookProvider,
  monerooWebhookProvider,
  __resetMonerooWebhookProvider,
} from './moneroo';

const WEBHOOK_SECRET = 'test-webhook-secret';

function sign(body: Buffer, secret = WEBHOOK_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

beforeEach(() => {
  __resetMonerooWebhookProvider();
  vi.unstubAllEnvs();
  vi.stubEnv('MONEROO_SECRET_KEY', 'sk_test_1');
  vi.stubEnv('MONEROO_WEBHOOK_SECRET', WEBHOOK_SECRET);
  delete process.env.SMOKE_BYPASS_WEBHOOK_VERIFY;
});

describe('getMonerooWebhookProvider', () => {
  it('throws when MONEROO_SECRET_KEY is missing', () => {
    vi.stubEnv('MONEROO_SECRET_KEY', '');
    expect(() => getMonerooWebhookProvider()).toThrow(/not configured/);
  });

  it('throws when MONEROO_WEBHOOK_SECRET is missing', () => {
    vi.stubEnv('MONEROO_WEBHOOK_SECRET', '');
    expect(() => getMonerooWebhookProvider()).toThrow(/not configured/);
  });

  it('caches the provider across calls (lazy singleton)', () => {
    const a = getMonerooWebhookProvider();
    const b = getMonerooWebhookProvider();
    expect(a).toBe(b);
  });
});

describe('monerooWebhookProvider.verifySignature', () => {
  it('accepts a valid HMAC-SHA256 signature', () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.success', data: { id: 'p1' } }));
    const sig = sign(body);
    const result = monerooWebhookProvider.verifySignature(body, { 'x-moneroo-signature': sig });
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.success', data: { id: 'p1' } }));
    const sig = sign(body);
    const tampered = Buffer.from(JSON.stringify({ event: 'payment.success', data: { id: 'p2' } }));
    const result = monerooWebhookProvider.verifySignature(tampered, {
      'x-moneroo-signature': sig,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects when the header is missing', () => {
    const body = Buffer.from('{}');
    const result = monerooWebhookProvider.verifySignature(body, {});
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/no x-moneroo-signature/);
  });

  it('bypasses verification when SMOKE_BYPASS_WEBHOOK_VERIFY=1 (dev-only)', () => {
    process.env.SMOKE_BYPASS_WEBHOOK_VERIFY = '1';
    const body = Buffer.from('{}');
    const result = monerooWebhookProvider.verifySignature(body, {});
    expect(result.valid).toBe(true);
    delete process.env.SMOKE_BYPASS_WEBHOOK_VERIFY;
  });
});

describe('monerooWebhookProvider.extractIds', () => {
  it('classifies payment.success as kind=paid', () => {
    const ids = monerooWebhookProvider.extractIds({
      event: 'payment.success',
      data: { id: 'p1' },
    });
    expect(ids).toEqual({ externalId: 'p1', eventType: 'payment.success', kind: 'paid' });
  });

  it('classifies payment.failed as kind=failed', () => {
    const ids = monerooWebhookProvider.extractIds({
      event: 'payment.failed',
      data: { id: 'p2' },
    });
    expect(ids.kind).toBe('failed');
  });

  it('classifies payment.cancelled as kind=failed', () => {
    const ids = monerooWebhookProvider.extractIds({
      event: 'payment.cancelled',
      data: { id: 'p3' },
    });
    expect(ids.kind).toBe('failed');
  });

  it('classifies unknown events as kind=other', () => {
    const ids = monerooWebhookProvider.extractIds({
      event: 'payment.pending',
      data: { id: 'p4' },
    });
    expect(ids.kind).toBe('other');
  });
});

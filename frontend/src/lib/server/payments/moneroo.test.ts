import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMonerooProvider } from './moneroo';

const env = { MONEROO_SECRET_KEY: 'sk_test_1', MONEROO_WEBHOOK_SECRET: 'wh_secret' };

describe('createMonerooProvider — construction', () => {
  it('throws when MONEROO_SECRET_KEY is missing', () => {
    expect(() =>
      createMonerooProvider({ MONEROO_SECRET_KEY: '', MONEROO_WEBHOOK_SECRET: 'x' }),
    ).toThrow(/MONEROO_SECRET_KEY/);
  });

  it('throws when MONEROO_WEBHOOK_SECRET is missing', () => {
    expect(() =>
      createMonerooProvider({ MONEROO_SECRET_KEY: 'x', MONEROO_WEBHOOK_SECRET: '' }),
    ).toThrow(/MONEROO_WEBHOOK_SECRET/);
  });

  it('defaults MONEROO_API_URL to https://api.moneroo.io/v1', async () => {
    const provider = createMonerooProvider(env);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: 'p1', checkout_url: 'https://checkout.moneroo.io/p1' } }),
        {
          status: 201,
        },
      ),
    );
    await provider.charge({
      amount: 1000,
      currency: 'GNF',
      customer: { email: 'a@example.com' },
      successUrl: 'https://app.test/success',
      failureUrl: 'https://app.test/fail',
      externalRef: 'ref1',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.moneroo.io/v1/payments/initialize',
      expect.anything(),
    );
    fetchSpy.mockRestore();
  });
});

describe('createMonerooProvider().charge', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('sends Bearer auth + JSON body and returns providerChargeId/paymentUrl/PENDING', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Transaction initialized successfully',
          data: { id: 'pay_abc', checkout_url: 'https://checkout.moneroo.io/pay_abc' },
        }),
        { status: 201 },
      ),
    );

    const provider = createMonerooProvider(env);
    const result = await provider.charge({
      amount: 2_000_000,
      currency: 'GNF',
      customer: { email: 'school@example.com', name: 'École Test' },
      successUrl: 'https://app.test/billing?paid=1',
      failureUrl: 'https://app.test/billing?failed=1',
      externalRef: 'payment_123',
    });

    expect(result).toEqual({
      providerChargeId: 'pay_abc',
      paymentUrl: 'https://checkout.moneroo.io/pay_abc',
      status: 'PENDING',
    });

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk_test_1');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      amount: 2_000_000,
      currency: 'GNF',
      return_url: 'https://app.test/billing?paid=1',
      customer: { email: 'school@example.com', first_name: 'École', last_name: 'Test' },
    });
  });

  it('splits a single-word name into matching first/last name', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'p1', checkout_url: 'https://x/1' } }), {
        status: 201,
      }),
    );
    const provider = createMonerooProvider(env);
    await provider.charge({
      amount: 1000,
      currency: 'GNF',
      customer: { email: 'a@example.com', name: 'Madame' },
      successUrl: 'https://app.test/s',
      failureUrl: 'https://app.test/f',
      externalRef: 'ref2',
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.customer.first_name).toBe('Madame');
    expect(body.customer.last_name).toBe('Madame');
  });

  it('derives a name from the email local-part when customer.name is absent', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'p1', checkout_url: 'https://x/1' } }), {
        status: 201,
      }),
    );
    const provider = createMonerooProvider(env);
    await provider.charge({
      amount: 1000,
      currency: 'GNF',
      customer: { email: 'directrice@ecole.gn' },
      successUrl: 'https://app.test/s',
      failureUrl: 'https://app.test/f',
      externalRef: 'ref3',
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.customer.first_name).toBe('directrice');
    expect(body.customer.last_name).toBe('directrice');
  });

  it('throws when customer.email is missing', async () => {
    const provider = createMonerooProvider(env);
    await expect(
      provider.charge({
        amount: 1000,
        currency: 'GNF',
        customer: {},
        successUrl: 'https://app.test/s',
        failureUrl: 'https://app.test/f',
        externalRef: 'ref4',
      }),
    ).rejects.toThrow(/requires customer.email/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws with the provider message on a non-2xx response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid currency' }), { status: 422 }),
    );
    const provider = createMonerooProvider(env);
    await expect(
      provider.charge({
        amount: 1000,
        currency: 'ZZZ',
        customer: { email: 'a@example.com' },
        successUrl: 'https://app.test/s',
        failureUrl: 'https://app.test/f',
        externalRef: 'ref5',
      }),
    ).rejects.toThrow(/Invalid currency/);
  });

  it('throws on a network error', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));
    const provider = createMonerooProvider(env);
    await expect(
      provider.charge({
        amount: 1000,
        currency: 'GNF',
        customer: { email: 'a@example.com' },
        successUrl: 'https://app.test/s',
        failureUrl: 'https://app.test/f',
        externalRef: 'ref6',
      }),
    ).rejects.toThrow(/Moneroo network error/);
  });
});

describe('createMonerooProvider().refund', () => {
  it('always throws — not supported', async () => {
    const provider = createMonerooProvider(env);
    await expect(provider.refund!({ providerChargeId: 'pay_1' })).rejects.toThrow(/not supported/);
  });
});

describe('createMonerooProvider() — no payout()', () => {
  it('does not implement payout (never wired to a live route)', () => {
    const provider = createMonerooProvider(env);
    expect(provider.payout).toBeUndefined();
  });
});

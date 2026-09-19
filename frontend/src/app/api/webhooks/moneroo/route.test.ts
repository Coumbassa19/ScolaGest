// Tests for POST /api/webhooks/moneroo.
//
// prismaMock is a mockDeep<PrismaClient> (D-25). `$transaction` is stubbed to
// invoke the callback with `prismaMock` itself as `tx` — every model method
// used inside the transaction (webhookLog, order, schoolSubscriptionPayment,
// school, outboxEvent) is already a vi.fn() on that same deep mock.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { monerooFixtureRequest } from '@/test-utils/moneroo-mock';

vi.stubEnv('MONEROO_SECRET_KEY', 'sk_test_1');
vi.stubEnv('MONEROO_WEBHOOK_SECRET', 'test-webhook-secret');

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn) => {
    if (typeof fn === 'function') {
      return fn(prismaMock as never);
    }
    return undefined as never;
  });
  prismaMock.webhookLog.findUnique.mockResolvedValue(null as never);
});

describe('POST /api/webhooks/moneroo — signature', () => {
  it('rejects a request with an invalid signature → 401', async () => {
    const { req } = monerooFixtureRequest({ webhookSecret: 'wrong-secret' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/moneroo — onPaid (Order)', () => {
  it('marks the matching Order PAID and enqueues outbox events', async () => {
    prismaMock.order.findFirst.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      customerEmail: 'buyer@example.com',
      amount: 1000,
      currency: 'GNF',
    } as never);

    const { req } = monerooFixtureRequest({ event: 'payment.success', paymentId: 'pay_1' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order_1' },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/webhooks/moneroo — onPaid (SchoolSubscriptionPayment)', () => {
  it('falls back to SchoolSubscriptionPayment, extends period, activates School', async () => {
    prismaMock.order.findFirst.mockResolvedValue(null as never);
    prismaMock.schoolSubscriptionPayment.findFirst.mockResolvedValue({
      id: 'ssp_1',
      schoolId: 'school_1',
    } as never);
    prismaMock.school.findUnique.mockResolvedValue({ currentPeriodEnd: null } as never);

    const { req } = monerooFixtureRequest({ event: 'payment.success', paymentId: 'pay_2' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prismaMock.schoolSubscriptionPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ssp_1' },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(prismaMock.school.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'school_1' },
        data: expect.objectContaining({ status: 'ACTIVE', remindersSentDays: [] }),
      }),
    );
  });

  it('drops an unknown charge id silently (no Order, no SchoolSubscriptionPayment)', async () => {
    prismaMock.order.findFirst.mockResolvedValue(null as never);
    prismaMock.schoolSubscriptionPayment.findFirst.mockResolvedValue(null as never);

    const { req } = monerooFixtureRequest({ event: 'payment.success', paymentId: 'pay_unknown' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prismaMock.school.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/moneroo — onFailed', () => {
  it('marks the matching Order FAILED', async () => {
    prismaMock.order.findFirst.mockResolvedValue({ id: 'order_2' } as never);

    const { req } = monerooFixtureRequest({ event: 'payment.failed', paymentId: 'pay_3' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order_2' }, data: { status: 'FAILED' } }),
    );
  });
});

describe('POST /api/webhooks/moneroo — dedup', () => {
  it('short-circuits an already-processed (externalId, eventType) pair', async () => {
    prismaMock.webhookLog.findUnique.mockResolvedValue({
      id: 'log_1',
      processedAt: new Date(),
    } as never);

    const { req } = monerooFixtureRequest({ event: 'payment.success', paymentId: 'pay_4' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduped).toBe(true);
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
  });
});

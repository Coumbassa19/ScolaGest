import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

const sendSubscriptionRemindersMock = vi.fn();
vi.mock('@/lib/server/billing/subscription-reminders', () => ({
  sendSubscriptionReminders: sendSubscriptionRemindersMock,
}));

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  sendSubscriptionRemindersMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/subscription-reminders', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/subscription-reminders', () => {
  it('returns 401 when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('calls sendSubscriptionReminders with prisma + appUrl', async () => {
    sendSubscriptionRemindersMock.mockResolvedValueOnce({ sent: 0, skipped: 0 });
    const { POST } = await import('./route');
    await POST(makeReq());
    expect(sendSubscriptionRemindersMock).toHaveBeenCalled();
    const arg = sendSubscriptionRemindersMock.mock.calls[0]![0] as {
      prisma: unknown;
      appUrl: string;
    };
    expect(arg.prisma).toBeDefined();
    expect(arg.appUrl).toBeTruthy();
  });

  it('returns sent/skipped counts from the helper', async () => {
    sendSubscriptionRemindersMock.mockResolvedValueOnce({ sent: 2, skipped: 1 });
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 2, skipped: 1 });
  });
});

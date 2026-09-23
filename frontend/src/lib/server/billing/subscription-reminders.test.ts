import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const enqueue = vi.fn();
const sendNow = vi.fn();
const getEmailQueueMock = vi.fn();

vi.mock('../queues/email-queue-singleton', () => ({
  getEmailQueue: () => getEmailQueueMock(),
}));

import { sendSubscriptionReminders } from './subscription-reminders';

function makePrismaMock(overrides: {
  trialingSchools?: unknown[];
  activeSchools?: unknown[];
  users?: unknown[];
}) {
  const schoolFindMany = vi
    .fn()
    .mockResolvedValueOnce(overrides.trialingSchools ?? [])
    .mockResolvedValueOnce(overrides.activeSchools ?? []);
  const schoolUpdate = vi.fn();
  const userFindMany = vi.fn().mockResolvedValue(overrides.users ?? []);
  return {
    school: { findMany: schoolFindMany, update: schoolUpdate },
    user: { findMany: userFindMany },
  } as unknown as PrismaClient;
}

beforeEach(() => {
  enqueue.mockReset().mockResolvedValue('job-1');
  sendNow.mockReset().mockResolvedValue({ status: 'SENT' });
  getEmailQueueMock.mockReset().mockReturnValue({ enqueue, sendNow });
});

describe('sendSubscriptionReminders', () => {
  it('returns {sent:0, skipped:0} when no school is within the reminder window', async () => {
    const prisma = makePrismaMock({});
    const result = await sendSubscriptionReminders({ prisma, appUrl: 'https://app.test' });
    expect(result).toEqual({ sent: 0, skipped: 0 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('sends the J-15 reminder to a trialing school 9 days out (CROISSANCE pricing) and records milestone 15', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const trialEndsAt = new Date('2026-01-10T00:00:00Z'); // 9 days out — inside the window
    const prisma = makePrismaMock({
      trialingSchools: [
        {
          id: 'school-1',
          name: 'École Test',
          plan: 'CROISSANCE',
          trialEndsAt,
          remindersSentDays: [],
        },
      ],
      users: [{ email: 'owner@school1.test' }],
    });
    const result = await sendSubscriptionReminders({ prisma, appUrl: 'https://app.test', now });
    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@school1.test',
        subject: expect.stringContaining('École Test'),
        html: expect.stringContaining('3 000 000 GNF'),
      }),
    );
    expect(prisma.school.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({
      where: { id: 'school-1' },
      data: { remindersSentDays: { push: 15 } },
    });
  });

  it('uses the ESSENTIEL plan price (2 000 000 GNF) for a school on that plan', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const trialEndsAt = new Date('2026-01-10T00:00:00Z');
    const prisma = makePrismaMock({
      trialingSchools: [
        {
          id: 'school-1b',
          name: 'École Primaire',
          plan: 'ESSENTIEL',
          trialEndsAt,
          remindersSentDays: [],
        },
      ],
      users: [{ email: 'owner@primaire.test' }],
    });
    await sendSubscriptionReminders({ prisma, appUrl: 'https://app.test', now });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('2 000 000 GNF') }),
    );
  });

  it('sends the J-7 reminder (not J-15 again) when milestone 15 was already sent', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const currentPeriodEnd = new Date('2026-01-07T00:00:00Z'); // 6 days out
    const prisma = makePrismaMock({
      activeSchools: [
        { id: 'school-2', name: 'École Renouvellement', currentPeriodEnd, remindersSentDays: [15] },
      ],
      users: [{ email: 'owner@school2.test' }],
    });
    const result = await sendSubscriptionReminders({ prisma, appUrl: 'https://app.test', now });
    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(prisma.school.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({
      where: { id: 'school-2' },
      data: { remindersSentDays: { push: 7 } },
    });
  });

  it('sends the J-1 (last-day) reminder when the school expires tomorrow', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const trialEndsAt = new Date('2026-01-02T00:00:00Z'); // 1 day out
    const prisma = makePrismaMock({
      trialingSchools: [
        { id: 'school-3', name: 'École Dernier Jour', trialEndsAt, remindersSentDays: [15, 7] },
      ],
      users: [{ email: 'owner@school3.test' }],
    });
    const result = await sendSubscriptionReminders({ prisma, appUrl: 'https://app.test', now });
    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('1 jour') }),
    );
    expect(prisma.school.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({
      where: { id: 'school-3' },
      data: { remindersSentDays: { push: 1 } },
    });
  });

  it('sends nothing further once every milestone (15, 7, 1) has already been sent', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const trialEndsAt = new Date('2026-01-02T00:00:00Z'); // 1 day out
    const prisma = makePrismaMock({
      trialingSchools: [
        { id: 'school-4', name: 'École Déjà Prévenue', trialEndsAt, remindersSentDays: [15, 7, 1] },
      ],
    });
    const result = await sendSubscriptionReminders({ prisma, appUrl: 'https://app.test', now });
    expect(result).toEqual({ sent: 0, skipped: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(prisma.school.update).not.toHaveBeenCalled();
  });

  it('skips a school with no DIRECTION recipient without crashing', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const prisma = makePrismaMock({
      activeSchools: [
        {
          id: 'school-5',
          name: 'École Sans Direction',
          currentPeriodEnd: new Date('2026-01-05T00:00:00Z'),
          remindersSentDays: [],
        },
      ],
      users: [],
    });
    const result = await sendSubscriptionReminders({ prisma, appUrl: 'https://app.test', now });
    expect(result).toEqual({ sent: 0, skipped: 1 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(prisma.school.update).not.toHaveBeenCalled();
  });

  it('skips every candidate (without crashing) when the email queue is not configured', async () => {
    getEmailQueueMock.mockReturnValueOnce(null);
    const now = new Date('2026-01-01T00:00:00Z');
    const prisma = makePrismaMock({
      trialingSchools: [
        {
          id: 'school-6',
          name: 'École X',
          trialEndsAt: new Date('2026-01-05T00:00:00Z'),
          remindersSentDays: [],
        },
      ],
    });
    const result = await sendSubscriptionReminders({ prisma, appUrl: 'https://app.test', now });
    expect(result).toEqual({ sent: 0, skipped: 1 });
  });
});

// ADMIN-01 (Wave 1) — users DETAIL endpoint behaviour.
// Mirrors the pattern from the LIST sibling test.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireSchoolAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireSchoolAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireSchoolAdmin = vi.mocked(requireSchoolAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: {
    id: adminUser.id,
    email: adminUser.email,
    role: 'ADMIN' as const,
    schoolId: 'school_1',
    prisma: prismaMock,
  },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSchoolAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('/api/admin/users/[id] — detail', () => {
  it('GET returns 200 { user } for an existing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      name: null,
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-05-01T00:00:00Z'),
    } as never);

    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.id).toBe('u1');
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('GET returns 404 USER_NOT_FOUND for a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet('http://test/api/admin/users/missing'), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('USER_NOT_FOUND');
  });

  it('GET propagates 429 from rate limiter without DB hit', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(429);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('GET propagates 403 from requireSchoolAdmin without DB hit', async () => {
    mockRequireSchoolAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('GET returns 404 for a DIRECTION actor targeting another school (no cross-tenant leak)', async () => {
    mockRequireSchoolAdmin.mockResolvedValueOnce({
      user: { sub: 'dir_1', email: 'dir@test.local' },
      admin: {
        id: 'dir_1',
        email: 'dir@test.local',
        role: 'DIRECTION' as const,
        schoolId: 'school_1',
        prisma: prismaMock,
      },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u_other_school',
      email: 'other@test.local',
      name: null,
      avatarUrl: null,
      role: 'TEACHER',
      status: 'ACTIVE',
      emailVerifiedAt: null,
      createdAt: new Date('2026-05-01T00:00:00Z'),
      schoolId: 'school_2',
    } as never);

    const res = await GET(
      makeGet('http://test/api/admin/users/u_other_school'),
      ctxWith('u_other_school'),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('USER_NOT_FOUND');
  });
});

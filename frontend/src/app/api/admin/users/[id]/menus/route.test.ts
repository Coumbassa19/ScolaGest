// PATCH /api/admin/users/[id]/menus — gated by requireSchoolAdmin
// (ADMIN/SUPERADMIN, or a DIRECTION account acting on its own school).
// Covers the DIRECTION ownership check added alongside requireSchoolAdmin:
// a school owner must be able to adjust ITS OWN staff's menus, but never
// reach across into another school's account by id (User isn't tenant-
// scoped by admin.prisma — see requireSchoolAdmin's comment in
// src/lib/server/middleware/index.ts).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireSchoolAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { requireSchoolAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';

const mockRequireSchoolAdmin = vi.mocked(requireSchoolAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const directionCtx = {
  user: { sub: 'dir_1', email: 'dir@test.local' },
  admin: {
    id: 'dir_1',
    email: 'dir@test.local',
    role: 'DIRECTION' as const,
    schoolId: 'school_1',
    prisma: prismaMock,
  },
};

function makePatch(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function paramsOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSchoolAdmin.mockResolvedValue(directionCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe('PATCH /api/admin/users/[id]/menus', () => {
  it('DIRECTION updates a TEACHER in its own school → 200 + AdminAction', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'teacher_1',
      role: 'TEACHER',
      enabledMenus: ['grades'],
      schoolId: 'school_1',
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({
      id: 'teacher_1',
      enabledMenus: ['grades', 'schedule'],
    } as never);

    const res = await PATCH(
      makePatch('http://test/api/admin/users/teacher_1/menus', {
        enabledMenus: ['grades', 'schedule'],
      }),
      paramsOf('teacher_1'),
    );

    expect(res.status).toBe(200);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: 'dir_1', action: 'user.menus_change' }),
    );
  });

  it('DIRECTION targeting another school → 404 USER_NOT_FOUND (no cross-tenant leak)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'teacher_2',
      role: 'TEACHER',
      enabledMenus: [],
      schoolId: 'school_2',
    } as never);

    const res = await PATCH(
      makePatch('http://test/api/admin/users/teacher_2/menus', { enabledMenus: ['grades'] }),
      paramsOf('teacher_2'),
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('USER_NOT_FOUND');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('ADMIN (no schoolId restriction) can still update any school → 200', async () => {
    mockRequireSchoolAdmin.mockResolvedValueOnce({
      user: { sub: 'admin_1', email: 'admin@test.local' },
      admin: {
        id: 'admin_1',
        email: 'admin@test.local',
        role: 'ADMIN' as const,
        schoolId: null,
        prisma: prismaMock,
      },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'teacher_3',
      role: 'TEACHER',
      enabledMenus: [],
      schoolId: 'school_9',
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({
      id: 'teacher_3',
      enabledMenus: ['grades'],
    } as never);

    const res = await PATCH(
      makePatch('http://test/api/admin/users/teacher_3/menus', { enabledMenus: ['grades'] }),
      paramsOf('teacher_3'),
    );

    expect(res.status).toBe(200);
  });

  it('target is ADMIN/SUPERADMIN → 400 UNRESTRICTED_ROLE', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'admin_target',
      role: 'ADMIN',
      enabledMenus: [],
      schoolId: 'school_1',
    } as never);

    const res = await PATCH(
      makePatch('http://test/api/admin/users/admin_target/menus', { enabledMenus: ['grades'] }),
      paramsOf('admin_target'),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('UNRESTRICTED_ROLE');
  });

  it('missing target → 404 USER_NOT_FOUND', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const res = await PATCH(
      makePatch('http://test/api/admin/users/missing/menus', { enabledMenus: [] }),
      paramsOf('missing'),
    );

    expect(res.status).toBe(404);
  });

  it('propagates 403 from requireSchoolAdmin without DB hit', async () => {
    mockRequireSchoolAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );

    const res = await PATCH(
      makePatch('http://test/api/admin/users/u1/menus', { enabledMenus: [] }),
      paramsOf('u1'),
    );

    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when CSRF fails, before requireSchoolAdmin is even called', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );

    const res = await PATCH(
      makePatch('http://test/api/admin/users/u1/menus', { enabledMenus: [] }),
      paramsOf('u1'),
    );

    expect(res.status).toBe(403);
    expect(mockRequireSchoolAdmin).not.toHaveBeenCalled();
  });
});

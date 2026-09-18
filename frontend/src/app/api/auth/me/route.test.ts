// Tests for GET /api/auth/me (AUTH-06).
// Pattern 14. requireAuth-gated. Note: requireAuth uses cookies() from
// next/headers internally, so tests must use mockNextCookies + prismaMock.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return {
    ...actual,
    verifyToken: vi.fn(),
  };
});

import { verifyToken } from '@/lib/server/auth';
import { GET, PATCH } from './route';
import { NextRequest } from 'next/server';

function makeReq(opts: { tokenCookie?: string; bearer?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  return new NextRequest('https://test/api/auth/me', {
    method: 'GET',
    headers,
  });
}

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
});

describe('GET /api/auth/me', () => {
  it('Test 1: authed — returns user identity', async () => {
    // Place token cookie via mock store; requireAuth reads it via cookies().
    __cookieStore.clear();
    // Fake cookies.set: use mockStore via the mock-cookies internal store.
    // Simpler: test injects directly through Bearer header path which
    // requireAuth supports as a fallback when no cookie is present.
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);

    const res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { sub: 'u1', email: 'a@b.com' },
    });
  });

  it('Test 2: no cookie + no bearer — 401 missing token', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Missing token|token/i);
  });

  it('Test 3: stale tokenVersion — 401', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 1, // bumped via change-password
    } as never);

    const res = await GET(makeReq({ bearer: 'stale-jwt' }));
    expect(res.status).toBe(401);
  });

  it('Test 4: deleted user — 401', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u-deleted',
      email: 'gone@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await GET(makeReq({ bearer: 'orphan-jwt' }));
    expect(res.status).toBe(401);
  });
});

function makePatchReq(
  body: unknown,
  opts: { csrf?: 'match' | 'missing'; bearer?: string } = {},
): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  return new NextRequest('https://test/api/auth/me', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/auth/me', () => {
  it('Test 5: missing CSRF header — 403, no update', async () => {
    const res = await PATCH(makePatchReq({ name: 'New Name' }, { csrf: 'missing', bearer: 'x' }));
    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 6: requireAuth bail — 401, no update', async () => {
    const res = await PATCH(makePatchReq({ name: 'New Name' }));
    expect(res.status).toBe(401);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 7: valid body — updates name/phone/avatarUrl, returns updated fields', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);
    prismaMock.user.update.mockResolvedValue({
      id: 'u1',
      name: 'New Name',
      phone: '622000000',
      avatarUrl: null,
    } as never);

    const res = await PATCH(
      makePatchReq({ name: 'New Name', phone: '622000000' }, { bearer: 'valid-access-token' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ id: 'u1', name: 'New Name', phone: '622000000', avatarUrl: null });
  });

  it('Test 8: name too long — 400 VALIDATION_FAILED, no update', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);

    const res = await PATCH(
      makePatchReq({ name: 'x'.repeat(200) }, { bearer: 'valid-access-token' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

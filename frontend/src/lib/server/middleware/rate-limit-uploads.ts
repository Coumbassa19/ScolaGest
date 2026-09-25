// Per-userId rate limiter for POST /api/upload. Uploads land on Cloudinary
// (paid storage/bandwidth) — without a limit, a single compromised or
// malicious authenticated account can drive unbounded cost. Mirrors
// enforceAdminRateLimit's fail-closed-in-production semantics (see
// rate-limit-by-userid.ts): a misconfigured/unreachable Redis must not
// silently disable the limit in production.
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';

const UPLOAD_PREFIX = 'rl:upload:userid:';
const WINDOW_MS = 60 * 60 * 1000;
const MAX_HITS = 20;

/**
 * Enforce the per-userId upload rate limit (20/hour). Returns a 429
 * NextResponse when exceeded, otherwise null and the caller should proceed.
 */
export async function enforceUploadRateLimit(userId: string): Promise<NextResponse | null> {
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
          message: 'Rate-limit backend unavailable.',
        },
        { status: 503 },
      );
    }
    return null;
  }
  const store = new RedisRateLimitStore({ redis, prefix: '', windowMs: WINDOW_MS });
  const { totalHits, resetTime } = await store.increment(`${UPLOAD_PREFIX}${userId}`);
  if (totalHits > MAX_HITS) {
    const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: 'TOO_MANY_UPLOADS',
        message: 'Upload rate limit exceeded; retry shortly.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(MAX_HITS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetTime.getTime() / 1000)),
        },
      },
    );
  }
  return null;
}

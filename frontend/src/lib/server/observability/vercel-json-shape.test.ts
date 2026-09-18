// frontend/src/lib/server/observability/vercel-json-shape.test.ts — Phase 5 D-20.
//
// Tripwire: vercel.json deliberately declares NO crons — Vercel's Hobby plan
// caps native Cron Jobs at once/day, which is too coarse for outbox-drain /
// email-queue-drain (need minute-level ticks). Scheduling instead lives in
// an external free service (cron-job.org) per CRON_SETUP.md, which every
// cron route's own Authorization-header check (src/lib/server/cron/auth.ts)
// is agnostic to — it doesn't care who calls it, only that CRON_SECRET matches.
//
// This test guards against route-rename / doc-drift regressions where a
// developer renames or adds a cron route file but forgets CRON_SETUP.md
// (or vice versa) — same purpose as the old vercel.json-based check, just
// pointed at the new source of truth.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fg from 'fast-glob';

// frontend/src/lib/server/observability/ → frontend/ is 4 levels up.
const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(here, '../../../../');
const VERCEL_JSON = resolve(FRONTEND_ROOT, 'vercel.json');
const CRON_SETUP_MD = resolve(FRONTEND_ROOT, 'CRON_SETUP.md');
const APP_API_CRON = resolve(FRONTEND_ROOT, 'src/app/api/cron');

interface VercelConfig {
  crons?: Array<{ path: string; schedule: string }>;
}

describe('vercel.json / CRON_SETUP.md shape (CRON-07, D-20)', () => {
  it('frontend/vercel.json exists and declares no crons', () => {
    expect(existsSync(VERCEL_JSON)).toBe(true);
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    expect(cfg.crons ?? []).toEqual([]);
  });

  it('CRON_SETUP.md exists and documents every cron route file', async () => {
    expect(existsSync(CRON_SETUP_MD)).toBe(true);
    const doc = readFileSync(CRON_SETUP_MD, 'utf8');
    const routeFiles = await fg('*/route.ts', { cwd: APP_API_CRON, onlyFiles: true });
    const routeNames = routeFiles.map((f) => f.split('/')[0]!).sort();
    expect(routeNames.length).toBeGreaterThan(0);
    for (const name of routeNames) {
      expect(
        doc.includes(`/api/cron/${name}`),
        `CRON_SETUP.md is missing /api/cron/${name} — a cron route exists with no documented external schedule`,
      ).toBe(true);
    }
  });

  it('documents exactly the 7 canonical crons (Phase 5 + post-audit + ScolaGest billing)', async () => {
    const routeFiles = await fg('*/route.ts', { cwd: APP_API_CRON, onlyFiles: true });
    const routeNames = routeFiles.map((f) => f.split('/')[0]!).sort();
    expect(routeNames).toEqual([
      'email-job-purge',
      'email-queue-drain',
      'order-expiration',
      'outbox-drain',
      'subscription-reminders',
      'verification-cleanup',
      'webhook-log-purge',
    ]);
  });
});

// Goal: any page.tsx under src/app/** that isn't an explicitly-listed public
// page must call one of the known server-side auth guards. proxy.ts (the
// Next.js 16 middleware-equivalent) is NOT an auth gate — it only handles
// silent cookie refresh for a configurable path list (AUTH_PROTECTED_PREFIXES)
// and is a no-op when that env var is unset. The real, load-bearing
// authorization boundary is each page calling requirePageAuth (or one of its
// role-specific variants) as the first thing it does. Without this test, a
// newly-added page that forgets that call is silently and completely
// unauthenticated — nothing else in the stack would catch it.
import { describe, expect, it } from 'vitest';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_GLOB = 'src/app/**/page.tsx';
// Project-root-relative; vitest by default cwd is the package root (frontend/).
// Normalized to forward slashes — fast-glob always returns forward-slash
// paths even on Windows, but path.resolve() uses the native separator, so
// leaving ROOT with backslashes would make every `file.replace(ROOT, '')`
// below silently no-op instead of stripping the prefix.
const ROOT = resolve(__dirname, '../../../..').replace(/\\/g, '/');

// Pages that are intentionally reachable without a session: the
// pre-authentication auth flow itself, the public marketing homepage, and
// static error pages. Every other page.tsx must call a guard below.
const PUBLIC_PAGES = new Set([
  'src/app/page.tsx',
  'src/app/login/page.tsx',
  'src/app/signup/page.tsx',
  'src/app/forgot-password/page.tsx',
  'src/app/reset-password/page.tsx',
  'src/app/verify-email/page.tsx',
  'src/app/account-setup/page.tsx',
  'src/app/auth/error/page.tsx',
]);

const AUTH_GUARDS = [
  'requirePageAuth',
  'requireAdminPage',
  'requireSchoolAdminPage',
  'requireParentPage',
];

describe('page-auth enforcement: every non-public page.tsx calls a server-side auth guard', () => {
  const pageFiles = fg.sync(PAGE_GLOB, { cwd: ROOT, absolute: true });

  it('discovered at least one page.tsx file', () => {
    expect(pageFiles.length).toBeGreaterThan(0);
  });

  for (const file of pageFiles) {
    const rel = file.replace(ROOT + '/', '').replace(/\\/g, '/');
    if (PUBLIC_PAGES.has(rel)) continue;

    it(`${rel} calls an auth guard (${AUTH_GUARDS.join('|')})`, () => {
      const src = readFileSync(file, 'utf8');
      const called = AUTH_GUARDS.some((g) => new RegExp(`\\b${g}\\b`).test(src));
      expect(
        called,
        `${rel} doesn't call any of ${AUTH_GUARDS.join(', ')} — it would be reachable without authentication. ` +
          `If this page is genuinely meant to be public, add it to PUBLIC_PAGES in this test file.`,
      ).toBe(true);
    });
  }

  it('PUBLIC_PAGES entries actually exist on disk (catches typos/renames)', () => {
    const known = new Set(pageFiles.map((f) => f.replace(ROOT + '/', '').replace(/\\/g, '/')));
    for (const p of PUBLIC_PAGES) {
      expect(known.has(p), `${p} listed in PUBLIC_PAGES but no longer exists`).toBe(true);
    }
  });
});

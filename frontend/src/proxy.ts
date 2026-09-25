import { NextResponse, type NextRequest } from 'next/server';

// Per-request CSP nonce + header, applied to every HTML page this proxy
// sees (the matcher below already excludes _next/static, _next/image,
// favicon.ico and api/*, so this never touches JSON API responses).
//
// script-src uses a per-request nonce + 'strict-dynamic': Next.js reads the
// nonce off the `x-nonce` request header (set below) and applies it to its
// own bootstrap/chunk scripts automatically — this app has no inline
// <script> tags or next/script usage of its own (verified: none in src/),
// so nothing else needs to read the nonce.
//
// style-src keeps 'unsafe-inline': React/Tailwind rely on inline `style={}}`
// attributes throughout the app, and CSP has no practical per-attribute
// nonce mechanism for that — script-src is the layer that actually matters
// for XSS blast-radius, not style-src.
//
// img-src allows Cloudinary (POST /api/upload's storage backend — see its
// header comment) plus data:/blob: for client-side previews. connect-src
// allows Sentry's ingest host (NEXT_PUBLIC_SENTRY_DSN is empty by default —
// harmless to allow even when unconfigured). Fonts are self-hosted via
// next/font/google (downloaded at build time), so font-src is 'self' only —
// no fonts.gstatic.com needed.
function buildCsp(nonce: string): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' https://res.cloudinary.com data: blob:`,
    `font-src 'self'`,
    `connect-src 'self' https://*.sentry.io`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];
  return directives.join('; ');
}

// Silent-refresh gate for protected pages.
//
// The (15-min) access cookie can expire while a (7-day) refresh cookie is
// still valid — typically when a tab sat unfocused or the laptop slept. The
// (authed) layout calling /api/auth/me would 401 and the user would be kicked
// to /login. This proxy catches that case BEFORE the page renders and
// bounces the request through /api/auth/refresh-and-return, which mints fresh
// cookies and 303s back to the original URL — invisible to the user.
//
// Protected paths are configured via AUTH_PROTECTED_PREFIXES (comma-separated,
// e.g. "/dashboard,/account"). Empty by default — the API surface is the only
// thing shipped, so out-of-the-box this proxy is a no-op.
//
// We always delegate to /api/auth/refresh-and-return rather than checking the
// refresh cookie here: it's deliberately scoped to Path=/api/auth (see
// setAuthCookies in src/lib/server/auth.ts), so a request to a page route
// like /dashboard never carries it — only /api/auth/* routes do. Trying to
// read it here would always see it as absent and short-circuit straight to
// /login, defeating the whole silent-refresh purpose. refresh-and-return is
// itself under /api/auth, so it's the one place that can actually see the
// cookie and decide.
//
// Named `proxy` and filed as src/proxy.ts per the Next.js 16 convention.
// Both details matter: the old middleware.ts/middleware() naming still
// builds without error, but Turbopack dev silently never invokes it at all
// (confirmed empirically — no compile step, no request timings, nothing);
// and with an `src/app` layout this file has to live under src/ alongside
// it, not at the project root — a root-level proxy.ts is just as silently
// skipped. Don't move or rename this without re-verifying end-to-end (see
// the curl-based silent-refresh test in the reregister-student work).
//
// Edge runtime: no DB, no bcrypt, no Prisma. We only inspect cookies and
// build redirects — the heavy lifting happens in /api/auth/refresh-and-return
// (runtime=nodejs).

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
const ACCESS_COOKIE = `${COOKIE_PREFIX}-token`;

const AUTHED_PREFIXES = (process.env.AUTH_PROTECTED_PREFIXES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAuthedPath(pathname: string): boolean {
  return AUTHED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(req: NextRequest): NextResponse {
  // btoa is available in the Edge runtime; crypto.randomUUID() gives 122
  // bits of entropy, plenty for a single-request CSP nonce.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  function next(): NextResponse {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  if (AUTHED_PREFIXES.length === 0) return next();

  const { pathname, search } = req.nextUrl;
  if (!isAuthedPath(pathname)) return next();

  if (req.cookies.get(ACCESS_COOKIE)?.value) return next();

  const target = pathname + search;
  const url = req.nextUrl.clone();
  url.pathname = '/api/auth/refresh-and-return';
  url.search = `?next=${encodeURIComponent(target)}`;
  const res = NextResponse.redirect(url, 303);
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
};

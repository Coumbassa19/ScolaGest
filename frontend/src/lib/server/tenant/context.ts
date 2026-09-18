// Tenant (school) scoping helper.
//
// Schooling is NOT propagated via ambient/implicit state (no
// AsyncLocalStorage) — see the header comment in `../prisma.ts` for why:
// AsyncLocalStorage.enterWith() was tried first and proven unreliable in
// this stack (any Prisma call anywhere earlier in a request's causal chain
// breaks propagation once the enclosing async function returns to its
// caller). Instead, requireStaff/requirePageAuth return a schoolId-bound
// Prisma client directly (`auth.prisma`) — routes/pages shadow the
// top-level `prisma` import with it right after the auth check.
//
// This helper is only for the handful of `create()` calls whose Prisma
// input type requires `schoolId` explicitly (TypeScript can't see that the
// scoped client injects it automatically at runtime) — call it with the
// already-resolved `auth.user.schoolId` from requireStaff/requirePageAuth.
import 'server-only';

export function requireSchoolId(schoolId: string | null | undefined): string {
  if (!schoolId) {
    throw new Error(
      'requireSchoolId() called with no school on the account — ' +
        'this should never happen for a staff account past requireStaff()/requirePageAuth().',
    );
  }
  return schoolId;
}

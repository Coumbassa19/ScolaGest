// Single source of truth for "which top-level sidebar section is this" —
// used by both the Sidebar itself (src/components/Sidebar.tsx `navItems`)
// and the server-side permission checks (requireStaff / requirePageAuth)
// that gate the pages/routes behind each section. Keep this list in sync
// with `navItems`'s top-level `key` values — a mismatch means a menu can
// render but 403 when clicked, or vice versa.
export const MENU_KEYS = [
  'dashboard',
  'students',
  'teachers',
  'schedule',
  'subjects',
  'grades',
  'accounting',
  'absences',
  'messages',
  'settings',
] as const;

export type MenuKey = (typeof MENU_KEYS)[number];

export function isMenuKey(value: string): value is MenuKey {
  return (MENU_KEYS as readonly string[]).includes(value);
}

// Menus a TEACHER account can always reach, regardless of `enabledMenus` —
// the core of "a teacher can see their own subjects and enter their own
// grades" that shouldn't depend on an admin remembering to toggle it on.
// Anything else (messages, absences, schedule, …) is a bonus the admin
// grants explicitly via `enabledMenus`.
export const TEACHER_CORE_MENUS: readonly MenuKey[] = ['dashboard', 'grades', 'subjects'];

// DIRECTION accounts have no implicit menus — everything comes from
// `enabledMenus`, except the dashboard itself (there has to be somewhere
// to land after login).
export const DIRECTION_CORE_MENUS: readonly MenuKey[] = ['dashboard'];

// STAFF (non-teaching personnel — direction, comptabilité, surveillance,
// etc., see the Staff model) accounts work exactly like DIRECTION: no
// implicit menus beyond the dashboard, everything else is admin-picked via
// `enabledMenus` at account creation.
export const STAFF_CORE_MENUS: readonly MenuKey[] = ['dashboard'];

/**
 * The effective set of menu keys a user can see, given their role and
 * stored `enabledMenus`. `null` return means "unrestricted" (ADMIN/SUPERADMIN).
 */
export function effectiveMenus(role: string, enabledMenus: unknown): readonly MenuKey[] | null {
  if (role === 'ADMIN' || role === 'SUPERADMIN') return null;

  const stored: MenuKey[] = Array.isArray(enabledMenus)
    ? enabledMenus.filter((m): m is MenuKey => typeof m === 'string' && isMenuKey(m))
    : [];

  if (role === 'TEACHER') {
    return Array.from(new Set([...TEACHER_CORE_MENUS, ...stored]));
  }
  if (role === 'DIRECTION') {
    return Array.from(new Set([...DIRECTION_CORE_MENUS, ...stored]));
  }
  if (role === 'STAFF') {
    return Array.from(new Set([...STAFF_CORE_MENUS, ...stored]));
  }
  // USER (legacy/self-signup) or any unrecognized role: no domain menus.
  return [];
}

export function canAccessMenu(role: string, enabledMenus: unknown, menuKey: MenuKey): boolean {
  const effective = effectiveMenus(role, enabledMenus);
  return effective === null || effective.includes(menuKey);
}

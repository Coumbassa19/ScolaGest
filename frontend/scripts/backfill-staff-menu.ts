// One-off backfill for the new "Personnel" top-level menu (`staff` menu key,
// see menu-keys.ts). Schools that signed up BEFORE this change had their
// owner (role DIRECTION) account's `enabledMenus` populated with a snapshot
// of MENU_KEYS taken at signup time — adding a new key to MENU_KEYS doesn't
// retroactively appear there, since effectiveMenus() reads the stored array,
// not a live copy of MENU_KEYS. Without this backfill, every already-signed-
// up school's owner would simply not see the new menu item at all.
//
// Usage: pnpm db:backfill-staff-menu
//
// Idempotent — only touches DIRECTION-role users whose stored enabledMenus
// is an array that doesn't already include 'staff'. TEACHER/STAFF-role
// logins are untouched: 'staff' isn't part of their core menu set any more
// than 'teachers' or 'settings' is, and granting it retroactively to every
// staff login would be a bigger permission change than this rollout intends
// — an admin can still grant it explicitly via /settings/users/[id]/edit.

import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

interface RunDeps {
  // Injectable for tests — defaults to the lazy-instantiated PrismaClient
  // when called as a CLI.
  prisma?: Pick<PrismaClient, 'user' | '$disconnect'>;
}

export interface BackfillResult {
  usersChecked: number;
  usersUpdated: number;
}

export async function main(deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const directionUsers = await prisma.user.findMany({
      where: { role: 'DIRECTION' },
      select: { id: true, enabledMenus: true },
    });

    const result: BackfillResult = { usersChecked: directionUsers.length, usersUpdated: 0 };

    for (const user of directionUsers) {
      const stored = Array.isArray(user.enabledMenus) ? (user.enabledMenus as string[]) : [];
      if (stored.includes('staff')) continue;

      await prisma.user.update({
        where: { id: user.id },
        data: { enabledMenus: [...stored, 'staff'] },
      });
      result.usersUpdated++;
    }

    console.log(`✓ Checked ${result.usersChecked} DIRECTION account(s).`);
    console.log(`  ${result.usersUpdated} granted the new "Personnel" menu.`);

    return 0;
  } finally {
    if (!deps.prisma && prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

// Windows-safe entrypoint check: import.meta.url is a file:// URL with
// forward slashes (file:///C:/...) while process.argv[1] is an OS path
// (C:\...) — a plain string comparison silently never matches on Windows,
// so both sides are normalized through pathToFileURL first.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

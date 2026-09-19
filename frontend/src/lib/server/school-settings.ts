// Per-school identity config (name, address, contact, logo, and the
// République/devise shown on the student ID card), read by the bulletin
// (HTML + PDF), the student ID card (HTML + PDF), and edited from
// Paramètres > "Informations de l'établissement". One row per School (see
// `SchoolSettings.schoolId @unique`) — created with defaults on first read
// if the current school doesn't have one yet.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export interface SchoolSettingsData {
  name: string;
  type: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string | null;
  republiqueName: string;
  devise: string;
  // Sits directly under devise on the ID card (src/components/StudentIdCard.tsx),
  // and flagUrl overrides the default 3-stripe Guinea flag graphic — both
  // editable so a school outside Guinea can show its own national identity
  // on its cards without a code change. null flagUrl keeps the Guinea flag.
  ministryName: string;
  flagUrl: string | null;
  // Public homepage "trusted by" showcase — separate from the bulletin/ID
  // card logo above, and stored on School (not SchoolSettings): the
  // homepage query reads it unscoped, before any staff session exists.
  // See src/app/page.tsx's MIN_FEATURED_SCHOOLS_TO_SHOW gate.
  featuredOnHomepage: boolean;
  homepageLogoUrl: string | null;
}

export async function getSchoolSettings(
  prisma: PrismaClient,
  schoolId: string,
): Promise<SchoolSettingsData> {
  const [existing, school] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { schoolId } }),
    prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { featuredOnHomepage: true, logoUrl: true },
    }),
  ]);
  const settings = existing ?? (await prisma.schoolSettings.create({ data: { schoolId } }));
  return {
    ...settings,
    featuredOnHomepage: school.featuredOnHomepage,
    homepageLogoUrl: school.logoUrl,
  };
}

export interface SchoolSettingsUpdate {
  name?: string | undefined;
  type?: string | undefined;
  address?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  logoUrl?: string | null | undefined;
  republiqueName?: string | undefined;
  devise?: string | undefined;
  ministryName?: string | undefined;
  flagUrl?: string | null | undefined;
  featuredOnHomepage?: boolean | undefined;
  homepageLogoUrl?: string | null | undefined;
}

// Prisma's generated input types reject an explicitly-`undefined`-valued
// key under exactOptionalPropertyTypes (it wants the key omitted, not
// present-with-undefined) — strip those before spreading into upsert.
type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

function omitUndefined<T extends object>(obj: T): Defined<T> {
  const result: Defined<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) result[key] = value as Exclude<T[typeof key], undefined>;
  }
  return result;
}

export async function updateSchoolSettings(
  prisma: PrismaClient,
  schoolId: string,
  update: SchoolSettingsUpdate,
): Promise<SchoolSettingsData> {
  const { featuredOnHomepage, homepageLogoUrl, ...settingsUpdate } = update;
  const data = omitUndefined(settingsUpdate);

  const [settings, school] = await Promise.all([
    prisma.schoolSettings.upsert({
      where: { schoolId },
      create: { schoolId, ...data },
      update: data,
    }),
    featuredOnHomepage !== undefined || homepageLogoUrl !== undefined
      ? prisma.school.update({
          where: { id: schoolId },
          data: omitUndefined({ featuredOnHomepage, logoUrl: homepageLogoUrl }),
        })
      : prisma.school.findUniqueOrThrow({
          where: { id: schoolId },
          select: { featuredOnHomepage: true, logoUrl: true },
        }),
  ]);
  return {
    ...settings,
    featuredOnHomepage: school.featuredOnHomepage,
    homepageLogoUrl: school.logoUrl,
  };
}

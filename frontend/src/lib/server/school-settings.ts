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
}

export async function getSchoolSettings(
  prisma: PrismaClient,
  schoolId: string,
): Promise<SchoolSettingsData> {
  const existing = await prisma.schoolSettings.findUnique({ where: { schoolId } });
  if (existing) return existing;
  return prisma.schoolSettings.create({ data: { schoolId } });
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
  const data = omitUndefined(update);
  return prisma.schoolSettings.upsert({
    where: { schoolId },
    create: { schoolId, ...data },
    update: data,
  });
}

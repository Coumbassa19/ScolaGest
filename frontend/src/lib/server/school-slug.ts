// Shared slug generator for School.slug — used by the self-service signup
// route and by scripts/backfill-schools.ts so both derive slugs the same way.
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || 'ecole';
}

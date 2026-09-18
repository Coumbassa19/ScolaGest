// Shared between the HTML bulletin (/bulletin) and the bulk PDF export
// (/api/grades/bulletins/pdf) so both render the exact same wording. The
// school's own identity (name, address, contact, logo) is configurable —
// see src/lib/server/school-settings.ts — not hardcoded here.

const STOP_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'l']);

// Derives a short round-logo fallback (e.g. "Centre d'Excellence Académique"
// -> "CEA") from the school's name, used whenever no logo image has been
// uploaded yet — on both the HTML bulletin and the PDF export.
export function computeInitials(name: string): string {
  const words = name
    .split(/[\s-]+/)
    .map((w) => w.replace(/^[dl]['’]/i, ''))
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w.toLowerCase()));
  const initials = words.map((w) => w[0]?.toUpperCase() ?? '').join('');
  return initials.slice(0, 4) || 'ETS';
}

export const PERIODE_LABEL: Record<string, string> = {
  T1: '1er Trimestre',
  T2: '2ème Trimestre',
  T3: '3ème Trimestre',
};

export type AppreciationKey = 'excellent' | 'veryGood' | 'good' | 'fair' | 'weak';

// Returns a stable key rather than display text — the HTML bulletin
// (/bulletin) and /grades resolve it via next-intl's `bulletin` namespace so
// it renders in the viewer's locale; the PDF export (bulletin-pdf.ts) keeps
// using getAppreciation below for its still French-only output.
export function getAppreciationKey(note: number): AppreciationKey {
  if (note >= 16) return 'excellent';
  if (note >= 14) return 'veryGood';
  if (note >= 12) return 'good';
  if (note >= 10) return 'fair';
  return 'weak';
}

const APPRECIATION_FR: Record<AppreciationKey, string> = {
  excellent: 'Excellent',
  veryGood: 'Très bien',
  good: 'Bien',
  fair: 'Assez bien',
  weak: 'Faible',
};

// French-only text form, used by the PDF export.
export function getAppreciation(note: number): string {
  return APPRECIATION_FR[getAppreciationKey(note)];
}

export type ObservationKey = 'pending' | 'good' | 'needsWork';

export function defaultObservationKey(moyenne: number | null): ObservationKey {
  if (moyenne === null) return 'pending';
  return moyenne >= 12 ? 'good' : 'needsWork';
}

export function defaultObservation(moyenne: number | null): string {
  const key = defaultObservationKey(moyenne);
  if (key === 'pending') return 'Notes en attente de saisie.';
  return key === 'good'
    ? 'Bon travail. Continuez ainsi.'
    : 'Des efforts supplémentaires sont nécessaires.';
}

export type DecisionKey = 'pending' | 'pass' | 'watch';

export function decisionKey(moyenne: number | null): DecisionKey {
  if (moyenne === null) return 'pending';
  return moyenne >= 10 ? 'pass' : 'watch';
}

export function decisionText(moyenne: number | null): string {
  const key = decisionKey(moyenne);
  if (key === 'pending') return 'EN ATTENTE DE NOTES';
  return key === 'pass' ? '✓ ADMIS(E) AU TRIMESTRE SUIVANT' : '△ À SURVEILLER';
}

// Same wording without the ✓/△ symbols — the PDF export draws text with the
// standard Helvetica font (WinAnsi encoding), which can't represent those
// glyphs and would otherwise render garbage characters in their place.
export function decisionTextPlain(moyenne: number | null): string {
  if (moyenne === null) return 'EN ATTENTE DE NOTES';
  return moyenne >= 10 ? 'ADMIS(E) AU TRIMESTRE SUIVANT' : 'À SURVEILLER';
}

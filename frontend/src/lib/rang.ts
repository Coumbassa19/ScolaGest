// Ordinal rank formatting shared by /grades and /bulletin: "1er" (or "1ère"
// for a girl) for first place, "2e", "3e"... otherwise, and "Nex" (e.g.
// "1ex") when the student is tied with at least one other at that rank.
// English uses the standard 1st/2nd/3rd/4th ordinal suffixes and marks ties
// as "T-1st" (a common report-card convention for a shared rank), since
// English ordinals don't carry grammatical gender.
function englishOrdinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

export function formatRang(
  rang: number,
  sexe: string,
  tied: boolean,
  locale: 'fr' | 'en' = 'fr',
): string {
  if (locale === 'en') {
    const ordinal = `${rang}${englishOrdinalSuffix(rang)}`;
    return tied ? `T-${ordinal}` : ordinal;
  }
  if (tied) return `${rang}ex`;
  if (rang === 1) return sexe === 'F' ? '1ère' : '1er';
  return `${rang}e`;
}

// Spells out a GNF amount in words ("Cent cinquante mille francs guinéens
// seulement" / "One hundred and fifty thousand Guinean francs only") for
// the printed payment receipt. Writing the amount out in full — the way a
// paper receipt book or a bank cheque does — is what makes a receipt
// tamper-evident: a figure altered in digits ("150 000" → "1 150 000") no
// longer matches the words next to it, so any alteration is immediately
// visible. GNF has no subunit, so this only ever handles whole francs.
const FR_UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const FR_TEENS = [
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
];
const FR_TENS: Record<number, string> = {
  2: 'vingt',
  3: 'trente',
  4: 'quarante',
  5: 'cinquante',
  6: 'soixante',
};

function frTwoDigits(n: number): string {
  if (n === 0) return '';
  if (n < 10) return FR_UNITS[n] as string;
  if (n < 20) return FR_TEENS[n - 10] as string;
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7) {
    if (u === 0) return 'soixante-dix';
    if (u === 1) return 'soixante et onze';
    return `soixante-${FR_TEENS[u]}`;
  }
  if (t === 9) {
    if (u === 0) return 'quatre-vingt-dix';
    return `quatre-vingt-${FR_TEENS[u]}`;
  }
  if (t === 8) {
    if (u === 0) return 'quatre-vingts';
    return `quatre-vingt-${FR_UNITS[u]}`;
  }
  const base = FR_TENS[t] as string;
  if (u === 0) return base;
  if (u === 1) return `${base} et un`;
  return `${base}-${FR_UNITS[u]}`;
}

function frThreeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let words = '';
  if (h > 0) {
    words = h === 1 ? 'cent' : `${FR_UNITS[h]} cent`;
    if (rest === 0 && h > 1) words += 's';
  }
  if (rest > 0) words = words ? `${words} ${frTwoDigits(rest)}` : frTwoDigits(rest);
  return words;
}

function numberToFrenchWords(n: number): string {
  if (n === 0) return 'zéro';
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const units = n % 1_000;

  const parts: string[] = [];
  if (billions > 0) {
    parts.push(billions === 1 ? 'un milliard' : `${frThreeDigits(billions)} milliards`);
  }
  if (millions > 0) {
    parts.push(millions === 1 ? 'un million' : `${frThreeDigits(millions)} millions`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${frThreeDigits(thousands)} mille`);
  }
  if (units > 0 || parts.length === 0) parts.push(frThreeDigits(units));
  return parts.join(' ');
}

const EN_UNITS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const EN_TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enTwoDigits(n: number): string {
  if (n === 0) return '';
  if (n < 10) return EN_UNITS[n] as string;
  if (n < 20) return EN_TEENS[n - 10] as string;
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u > 0 ? `${EN_TENS[t]}-${EN_UNITS[u]}` : (EN_TENS[t] as string);
}

function enThreeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let words = '';
  if (h > 0) words = `${EN_UNITS[h]} hundred`;
  if (rest > 0) words = words ? `${words} and ${enTwoDigits(rest)}` : enTwoDigits(rest);
  return words;
}

function numberToEnglishWords(n: number): string {
  if (n === 0) return 'zero';
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const units = n % 1_000;

  const parts: string[] = [];
  if (billions > 0) parts.push(`${enThreeDigits(billions)} billion`);
  if (millions > 0) parts.push(`${enThreeDigits(millions)} million`);
  if (thousands > 0) parts.push(`${enThreeDigits(thousands)} thousand`);
  if (units > 0 || parts.length === 0) parts.push(enThreeDigits(units));
  return parts.join(' ');
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** e.g. "Cent cinquante mille francs guinéens seulement" / "One hundred and fifty thousand Guinean francs only" */
export function amountInWords(amount: number, locale: string): string {
  const n = Math.max(0, Math.round(amount));
  if (locale === 'en') {
    return `${capitalize(numberToEnglishWords(n))} Guinean francs only`;
  }
  return `${capitalize(numberToFrenchWords(n))} francs guinéens seulement`;
}

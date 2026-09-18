import { describe, it, expect } from 'vitest';
import { amountInWords } from './amount-in-words';

describe('amountInWords (fr)', () => {
  it('handles zero', () => {
    expect(amountInWords(0, 'fr')).toBe('Zéro francs guinéens seulement');
  });

  it('handles the soixante-dix / quatre-vingt(s) irregularities', () => {
    expect(amountInWords(71, 'fr')).toBe('Soixante et onze francs guinéens seulement');
    expect(amountInWords(80, 'fr')).toBe('Quatre-vingts francs guinéens seulement');
    expect(amountInWords(81, 'fr')).toBe('Quatre-vingt-un francs guinéens seulement');
    expect(amountInWords(91, 'fr')).toBe('Quatre-vingt-onze francs guinéens seulement');
    expect(amountInWords(21, 'fr')).toBe('Vingt et un francs guinéens seulement');
  });

  it('pluralizes cent only when it is an exact multiple', () => {
    expect(amountInWords(200, 'fr')).toBe('Deux cents francs guinéens seulement');
    expect(amountInWords(201, 'fr')).toBe('Deux cent un francs guinéens seulement');
  });

  it('never pluralizes mille and omits "un" before it', () => {
    expect(amountInWords(1000, 'fr')).toBe('Mille francs guinéens seulement');
    expect(amountInWords(2000, 'fr')).toBe('Deux mille francs guinéens seulement');
  });

  it('handles a realistic tuition amount', () => {
    expect(amountInWords(150_000, 'fr')).toBe(
      'Cent cinquante mille francs guinéens seulement',
    );
  });
});

describe('amountInWords (en)', () => {
  it('handles zero', () => {
    expect(amountInWords(0, 'en')).toBe('Zero Guinean francs only');
  });

  it('handles a realistic tuition amount', () => {
    expect(amountInWords(150_000, 'en')).toBe(
      'One hundred and fifty thousand Guinean francs only',
    );
  });

  it('rounds a fractional input to the nearest whole franc', () => {
    expect(amountInWords(1234.6, 'en')).toBe('One thousand two hundred and thirty-five Guinean francs only');
  });
});

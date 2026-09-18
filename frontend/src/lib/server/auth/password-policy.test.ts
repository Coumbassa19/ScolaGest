import { describe, it, expect } from 'vitest';
import { meetsPasswordComplexity } from './password-policy';

describe('meetsPasswordComplexity', () => {
  it('requires an uppercase letter, a lowercase letter, and a digit — all present passes', () => {
    expect(meetsPasswordComplexity('Abcdef1')).toBe(true);
  });

  it('rejects a password with no uppercase letter', () => {
    expect(meetsPasswordComplexity('abcdef1')).toBe(false);
  });

  it('rejects a password with no lowercase letter', () => {
    expect(meetsPasswordComplexity('ABCDEF1')).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(meetsPasswordComplexity('Abcdefg')).toBe(false);
  });

  it('rejects an all-lowercase passphrase even if long', () => {
    expect(meetsPasswordComplexity('a-strong-passphrase-without-any-digit')).toBe(false);
  });
});

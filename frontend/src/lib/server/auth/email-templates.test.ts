import { describe, it, expect } from 'vitest';
import { verificationEmail, resetPasswordEmail, accountSetupEmail } from './email-templates';

describe('verificationEmail', () => {
  it('returns { subject, html, text } all non-empty', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.subject).toBeTruthy();
    expect(t.html).toBeTruthy();
    expect(t.text).toBeTruthy();
  });

  it('embeds the code in both html and text', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.html).toContain('ABCD2345');
    expect(t.text).toContain('ABCD2345');
  });

  it('defaults to French (the app DEFAULT_LOCALE) when locale is omitted', () => {
    const t = verificationEmail({ code: 'XYZ12345', email: 'x@y.com' });
    expect(t.subject).toBe('Vérifiez votre adresse email');
  });

  it('renders English when locale is "en"', () => {
    const t = verificationEmail({ code: 'XYZ12345', email: 'x@y.com', locale: 'en' });
    expect(t.subject).toBe('Verify your email');
  });

  it('renders "dans N minutes" (fr) when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    // floor-biased: with 15 min remaining the actual rendered value can be
    // 14 or 15 — either is acceptable.
    expect(t.text).toMatch(/dans 1[45] minutes/);
    expect(t.html).toMatch(/dans 1[45] minutes/);
  });

  it('renders "in N minutes" (en) when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt, locale: 'en' });
    expect(t.text).toMatch(/in 1[45] minutes/);
    expect(t.html).toMatch(/in 1[45] minutes/);
  });

  it('renders "dans N heures" for multi-hour TTLs (fr)', () => {
    // +1 min buffer so the floor-biased rounding can't drop minutes to 119
    // (which would render "1 heure" instead of "2 heures" — a latent
    // flake fixed by audit pass 2).
    const expiresAt = new Date(Date.now() + 2 * 60 * 60_000 + 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    expect(t.text).toContain('dans 2 heures');
  });

  it('renders "in N hours" for multi-hour TTLs (en)', () => {
    const expiresAt = new Date(Date.now() + 2 * 60 * 60_000 + 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt, locale: 'en' });
    expect(t.text).toContain('in 2 hours');
  });

  it('falls back to "bientôt" (fr) when expiresAt is omitted', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.text).toContain('bientôt');
  });

  it('falls back to "soon" (en) when expiresAt is omitted', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', locale: 'en' });
    expect(t.text).toContain('expires soon');
  });

  it('falls back to "bientôt" when expiresAt is malformed', () => {
    const t = verificationEmail({
      code: 'ABCD2345',
      email: 'a@b.com',
      expiresAt: 'not-an-iso-date',
    });
    expect(t.text).toContain('bientôt');
  });

  it('falls back to "bientôt" when expiresAt is already in the past', () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    expect(t.text).toContain('bientôt');
  });
});

describe('resetPasswordEmail', () => {
  it('returns { subject, html, text } all non-empty', () => {
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com' });
    expect(t.subject).toBeTruthy();
    expect(t.html).toBeTruthy();
    expect(t.text).toBeTruthy();
  });

  it('embeds the code in both html and text', () => {
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com' });
    expect(t.html).toContain('WXYZ9876');
    expect(t.text).toContain('WXYZ9876');
  });

  it('defaults to French (the app DEFAULT_LOCALE) when locale is omitted', () => {
    const t = resetPasswordEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.subject).toBe('Réinitialisation de votre mot de passe');
  });

  it('renders English when locale is "en"', () => {
    const t = resetPasswordEmail({ code: 'ABCD2345', email: 'a@b.com', locale: 'en' });
    expect(t.subject).toBe('Reset your password');
  });

  it('renders "dans N minutes" (fr) when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com', expiresAt });
    expect(t.text).toMatch(/dans 1[45] minutes/);
  });

  it('renders "in N minutes" (en) when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com', expiresAt, locale: 'en' });
    expect(t.text).toMatch(/in 1[45] minutes/);
  });
});

describe('accountSetupEmail', () => {
  const setupUrl = 'https://app.example.com/account-setup?token=abc123XYZ';

  it('returns { subject, html, text } all non-empty', () => {
    const t = accountSetupEmail({ setupUrl, roleLabel: 'Enseignant' });
    expect(t.subject).toBeTruthy();
    expect(t.html).toBeTruthy();
    expect(t.text).toBeTruthy();
  });

  it('embeds the setup URL in both html and text', () => {
    const t = accountSetupEmail({ setupUrl, roleLabel: 'Enseignant' });
    expect(t.html).toContain(setupUrl);
    expect(t.text).toContain(setupUrl);
  });

  it('embeds the role label', () => {
    const t = accountSetupEmail({ setupUrl, roleLabel: 'Direction' });
    expect(t.html).toContain('Direction');
    expect(t.text).toContain('Direction');
  });

  it('greets by name when provided', () => {
    const t = accountSetupEmail({ setupUrl, roleLabel: 'Enseignant', name: 'Fatoumata Diallo' });
    expect(t.html).toContain('Fatoumata Diallo');
  });

  it('omits a name greeting when not provided', () => {
    const t = accountSetupEmail({ setupUrl, roleLabel: 'Enseignant' });
    expect(t.html).toContain('Bonjour,');
  });

  it('escapes HTML in the role label and name (WR-03 defense-in-depth)', () => {
    const t = accountSetupEmail({
      setupUrl,
      roleLabel: '<script>alert(1)</script>',
      name: '<b>x</b>',
    });
    expect(t.html).not.toContain('<script>');
    expect(t.html).not.toContain('<b>x</b>');
    expect(t.html).toContain('&lt;script&gt;');
  });

  it('defaults to French (the app DEFAULT_LOCALE) when locale is omitted', () => {
    const t = accountSetupEmail({ setupUrl, roleLabel: 'Enseignant' });
    expect(t.subject).toBe('Votre compte ScolaGest a été créé');
  });

  it('renders English when locale is "en"', () => {
    const t = accountSetupEmail({ setupUrl, roleLabel: 'Teacher', locale: 'en' });
    expect(t.subject).toBe('Your ScolaGest account was created');
  });

  it('renders "dans N minutes" (fr) when expiresAt is provided', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = accountSetupEmail({ setupUrl, roleLabel: 'Enseignant', expiresAt });
    expect(t.text).toMatch(/dans 1[45] minutes/);
  });

  it('falls back to "bientôt" when expiresAt is omitted', () => {
    const t = accountSetupEmail({ setupUrl, roleLabel: 'Enseignant' });
    expect(t.text).toContain('bientôt');
  });
});

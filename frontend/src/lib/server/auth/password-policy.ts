// Shared password rules — consumed by every route that sets/changes a
// password (schools/signup, auth/signup, change-password, set-password,
// reset-password, account-setup) so the length floor and complexity
// requirement never drift between them.
import 'server-only';

export const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 7);

const UPPERCASE_RE = /[A-Z]/;
const LOWERCASE_RE = /[a-z]/;
const DIGIT_RE = /[0-9]/;

/** Requires at least one uppercase letter, one lowercase letter, and one digit. */
export function meetsPasswordComplexity(password: string): boolean {
  return UPPERCASE_RE.test(password) && LOWERCASE_RE.test(password) && DIGIT_RE.test(password);
}

/**
 * The strength shown under "New password" while it is typed. It only advises: the rule that decides is the length
 * minimum of the server (server/auth.ts), which stays as it is.
 */
export type StrengthLevel = 0 | 1 | 2 | 3;
export interface PasswordStrength { level: StrengthLevel; label: '' | 'Weak' | 'Fair' | 'Strong' }
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { level: 0, label: '' };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(pattern => pattern.test(password)).length;
  const points = (password.length >= 8 ? 1 : 0) + (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0) + (classes >= 2 ? 1 : 0) + (classes >= 3 ? 1 : 0) + (classes >= 4 ? 1 : 0);
  return points >= 5 ? { level: 3, label: 'Strong' } : points >= 3 ? { level: 2, label: 'Fair' } : { level: 1, label: 'Weak' };
}

/**
 * The score of the reference's Change password dialog (0 to 8): one point for a length of 4 and for each step of 6 / 8 / 10 / 13
 * characters, one for upper and lower case together, one for a digit, one for a special character. Update is enabled, and the
 * server accepts the new password, from the score REFERENCE_PASSWORD_OK (the label "OK").
 */
export const REFERENCE_PASSWORD_OK = 5;
export function referencePasswordScore(password: string): number {
  if (!password) return 0;
  if (password.length < 4) return 1;
  let score = 1;
  for (const step of [6, 8, 10, 13]) if (password.length >= step) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*?_~\-£()]/.test(password)) score++;
  return Math.min(score, 8);
}
const TOO_WEAK = 'Password too weak. Use at least 8 characters with uppercase, lowercase, numbers and special characters.';
/** The labels of the reference by score; the first five are one text. */
export const REFERENCE_PASSWORD_LABELS = [TOO_WEAK, TOO_WEAK, TOO_WEAK, TOO_WEAK, TOO_WEAK, 'OK', 'Good', 'Strong', 'Very strong'] as const;
export const referencePasswordLabel = (password: string): string => password ? REFERENCE_PASSWORD_LABELS[referencePasswordScore(password)] : '';
/** Whether a new password is strong enough to be saved (the dialog and /api/auth/password use this one check). */
export const referencePasswordAccepted = (password: unknown): password is string => typeof password === 'string' && referencePasswordScore(password) >= REFERENCE_PASSWORD_OK;

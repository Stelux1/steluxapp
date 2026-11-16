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

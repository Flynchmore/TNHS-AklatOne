// Same scoring as the app's strength meter (frontend/src/components/mobile/ui.tsx: passwordStrength).
// Score >= 3 ("Good") is required, e.g. 12+ characters with mixed case, or 8+ with mixed case and a digit.
export function passwordScore(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length > 20) score = Math.max(0, score - 1);
  return score;
}

export const isStrongPassword = (password: string) => passwordScore(password) >= 3;

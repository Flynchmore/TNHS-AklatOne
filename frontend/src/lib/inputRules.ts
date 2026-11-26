/**
 * What each kind of field accepts while typing (developer request: numbers only where a number is asked, letters only
 * where a name is asked, never longer than the field allows). The server checks the same data again.
 */
export const rules = {
  /** 0-9 only (class record no., copies, year, codes). */
  digits: (v: string) => v.replace(/\D/g, ""),
  /** A person's name: letters (with ñ and accents), spaces, dot, dash, apostrophe. */
  name: (v: string) => v.replace(/[^\p{L}\p{M}\s.'-]/gu, "").replace(/\s{2,}/g, " ").replace(/^\s+/, ""),
  /** Department, designation, position: letters, numbers and simple punctuation. */
  words: (v: string) => v.replace(/[^\p{L}\p{M}\d\s.,&'()/-]/gu, "").replace(/\s{2,}/g, " ").replace(/^\s+/, ""),
  /** Usernames: letters, numbers, dot, dash, underscore (same as the server). */
  username: (v: string) => v.replace(/[^a-zA-Z0-9_.-]/g, ""),
  /** Emails: no spaces. */
  email: (v: string) => v.replace(/\s/g, ""),
  /** ISBN: digits, X and dashes. */
  isbn: (v: string) => v.toUpperCase().replace(/[^0-9X-]/g, ""),
  /** Library codes (serial number, recovery key): capitals, numbers and dashes. */
  code: (v: string) => v.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
} as const;
export type Rule = keyof typeof rules;

/** Longest text each input type may hold when the field does not say. */
export const DEFAULT_MAX: Record<string, number> = { password: 128, email: 191, search: 100, url: 300, tel: 20, text: 100 };

/** Wraps an onChange so the typed value follows `rule` first (works for controlled inputs). */
export function withRule<E extends { target: { value: string } }>(rule: Rule | undefined, onChange?: (e: E) => void) {
  if (!rule || !onChange) return onChange;
  return (e: E) => { const next = rules[rule](e.target.value); if (next !== e.target.value) e.target.value = next; onChange(e); };
}

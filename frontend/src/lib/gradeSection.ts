/** Grade & section is always written "10 - Archimedes" (Grade 7 to 10, then the section); the server checks the same. */
export const GRADE_SECTION = /^(7|8|9|10) - \S.*$/;
export const GRADE_SECTION_HINT = "Grade 7 to 10, then the section, e.g. 10 - Archimedes.";
export const GRADE_SECTION_ERROR = "Grade & section: use the format 10 - Archimedes (Grade 7 to 10, then the section).";

const cap = (s: string) => s.replace(/(^|\s)(\p{Ll})/gu, (_, sp: string, c: string) => sp + c.toUpperCase());

/**
 * Formats while the user types: "10a" -> "10 - A", "10 " or "10-" -> "10 - ", "Grade 10 archimedes" -> "10 - Archimedes".
 * `prev` is the value before this keystroke, so deleting back over " - " removes it instead of putting it back.
 */
export function formatGradeSection(next: string, prev = ""): string {
  const m = next.match(/^\s*(?:g(?:rade)?\.?\s*)?(\d{1,2})(\s*-?\s*)(.*)$/i);
  if (!m) return next.trimStart();
  const [, grade, sep, raw] = m as unknown as [string, string, string, string];
  const rest = raw.replace(/^[\s-]+/, ""); // a dash typed again after the automatic " - "
  if (rest) return `${grade} - ${cap(rest.replace(/\s{2,}/g, " "))}`;
  if (!sep && !raw) return grade;
  const full = `${grade} - `;
  return next.length < prev.length && next !== full ? grade : full;
}

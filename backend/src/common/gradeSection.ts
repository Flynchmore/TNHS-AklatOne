import { z } from "zod";

/** Grade & section is always written "10 - Archimedes": Grade 7 to 10 (Junior High School), space-dash-space, the section. */
export const GRADE_SECTION = /^(7|8|9|10) - \S.*$/;

/** "Grade 10 archimedes", "10-Archimedes", "10 Archimedes" -> "10 - Archimedes". Anything else is returned trimmed. */
export function normGradeSection(value: string): string {
  const m = value.trim().match(/^(?:g(?:rade)?\.?\s*)?(\d{1,2})\s*-?\s*(\S.*)$/i);
  if (!m) return value.trim();
  const section = m[2]!.trim().replace(/\s+/g, " ").replace(/(^|\s)(\p{Ll})/gu, (_, s: string, c: string) => s + c.toUpperCase());
  return `${Number(m[1])} - ${section}`;
}

/** Optional grade & section: blank stays blank (the caller decides what blank means), otherwise normalized and checked. */
export const gradeSectionField = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() ? normGradeSection(v) : "") : v),
  z.string().max(50).refine((v) => v === "" || GRADE_SECTION.test(v), "Grade & section: use the format 10 - Archimedes (Grade 7 to 10, then the section)."),
);

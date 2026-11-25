import { z } from "zod";

// Blank form fields arrive as "" — store them as null (and let an edit clear a field).
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());

export const BOOK_TYPES = ["Textbook", "Teacher's Manual", "Worksheet", "Other"] as const;
export const GRADE_LEVELS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "All grade levels"] as const;
// A date from a date field (YYYY-MM-DD, Philippine day) or blank.
export const dateReceived = z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-06-15").nullable().optional());
export const phDate = (d: string) => new Date(`${d}T00:00:00+08:00`);

const bookFields = {
  title: z.string().trim().min(1).max(255),
  subtitle: optionalText(255),
  isbn: optionalText(20),
  // Library shelf/serial code chosen by the librarian, e.g. NMT-001 (Noli Me Tángere).
  serialNumber: z.preprocess(
    v => (typeof v === "string" ? (v.trim() === "" ? null : v.trim().toUpperCase()) : v),
    z.string().regex(/^[A-Z0-9][A-Z0-9-]{1,29}$/, "Use 2-30 letters, numbers or dashes, e.g. NMT-001").nullable().optional(),
  ),
  authors: optionalText(255),
  publisher: optionalText(255),
  publishedYear: z.preprocess(blankToNull, z.coerce.number().int().min(1).max(3000).nullable().optional()),
  description: optionalText(2000),
  bookType: z.preprocess(blankToNull, z.enum(BOOK_TYPES).nullable().optional()),
  gradeLevel: z.preprocess(blankToNull, z.enum(GRADE_LEVELS).nullable().optional()),
  categoryIds: z.array(z.string().cuid()).optional(),
};

export const bookCreateSchema = z.object({
  ...bookFields,
  // How many physical copies to register right away (barcodes are generated from the serial number).
  copies: z.coerce.number().int().min(0).max(50).optional(),
  // Date received and shelf location of those first copies.
  dateReceived,
  location: optionalText(100),
});

// isHidden: staff can show a hidden book again (or hide one) from the Catalog.
export const bookUpdateSchema = z.object({ ...bookFields, isHidden: z.boolean() }).partial();

export const ratingSchema = z.object({
  stars: z.coerce.number().int().min(1).max(5),
  // Optional written review; empty string removes it. Shown to others only after the librarian approves it.
  review: z.string().trim().max(500).optional(),
});
export const reviewStatusSchema = z.object({ status: z.enum(["APPROVED", "HIDDEN"]) });

import { z } from "zod";

// Blank form fields arrive as "" — store them as null (and let an edit clear a field).
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());

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
  categoryIds: z.array(z.string().cuid()).optional(),
};

export const bookCreateSchema = z.object({
  ...bookFields,
  // How many physical copies to register right away (barcodes are generated from the serial number).
  copies: z.coerce.number().int().min(0).max(50).optional(),
});

// isHidden: staff can show a hidden book again (or hide one) from the Catalog.
export const bookUpdateSchema = z.object({ ...bookFields, isHidden: z.boolean() }).partial();

export const ratingSchema = z.object({ stars: z.coerce.number().int().min(1).max(5) });

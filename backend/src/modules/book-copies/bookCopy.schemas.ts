import { z } from "zod";
import { dateReceived } from "../catalog/book.schemas.js";

export const bookCopyCreateSchema = z.object({
  bookId: z.string().cuid(),
  // Optional: staff identify copies by the book's ISBN; the internal copy code is generated when left out.
  barcode: z.string().trim().min(1).max(64).optional(),
  status: z.enum(["AVAILABLE", "BORROWED", "LOST", "DAMAGED", "RETIRED"]).optional(),
  location: z.string().trim().max(100).optional(),
  notes: z.string().max(1000).optional(),
  dateReceived,
});

/** Shelf location, date received and notes of one copy (blank clears). */
export const bookCopyDetailsSchema = z.object({
  location: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(100).nullable().optional()),
  notes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(1000).nullable().optional()),
  dateReceived,
});

export const bookCopyStatusSchema = z.object({
  status: z.enum(["AVAILABLE", "BORROWED", "LOST", "DAMAGED", "RETIRED"]),
});
import { z } from "zod";

export const bookCopyCreateSchema = z.object({
  bookId: z.string().cuid(),
  // Optional: staff identify copies by the book's ISBN; the internal copy code is generated when left out.
  barcode: z.string().trim().min(1).max(64).optional(),
  status: z.enum(["AVAILABLE", "BORROWED", "LOST", "DAMAGED", "RETIRED"]).optional(),
  location: z.string().max(100).optional(),
  notes: z.string().optional(),
});

export const bookCopyStatusSchema = z.object({
  status: z.enum(["AVAILABLE", "BORROWED", "LOST", "DAMAGED", "RETIRED"]),
});
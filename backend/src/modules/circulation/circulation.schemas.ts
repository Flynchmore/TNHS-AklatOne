import { z } from "zod";

/**
 * Lending at the library desk. The member is given by account id or by the Member ID on their Library ID card;
 * the book by copy id, by the copy code on its QR label, or by book id (the first copy on the shelf is taken).
 */
export const borrowSchema = z.object({
  borrowerId: z.string().cuid().optional(),
  memberCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}\d{6}$/, "A Member ID looks like CA123456").optional(),
  bookCopyId: z.string().cuid().optional(),
  copyCode: z.string().trim().min(1).max(64).optional(),
  bookId: z.string().cuid().optional(),
  dueAt: z.coerce.date().optional().refine((d) => !d || d > new Date(), { message: "dueAt must be in the future" }),
  notes: z.string().max(500).optional(),
})
  .refine((d) => Number(!!d.borrowerId) + Number(!!d.memberCode) === 1, { message: "Give the member (Member ID)", path: ["memberCode"] })
  .refine((d) => Number(!!d.bookCopyId) + Number(!!d.copyCode) + Number(!!d.bookId) === 1, { message: "Give the book (scan its QR label or pick it from the catalog)", path: ["copyCode"] });

// The loan by id, or by the copy code on the book's QR label (scanning the book at the desk or with the phone).
export const returnSchema = z.object({
  transactionId: z.string().cuid().optional(),
  copyCode: z.string().trim().min(1).max(64).optional(),
  notes: z.string().optional(),
  // Omitted: on time or late, decided from dueAt.
  outcome: z.enum(["RETURNED_ON_TIME", "RETURNED_LATE", "DAMAGED", "MISSING"]).optional(),
}).refine((d) => Number(!!d.transactionId) + Number(!!d.copyCode) === 1, { message: "Give the loan or scan the book", path: ["copyCode"] });
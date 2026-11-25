import { z } from "zod";

export const createRequestSchema = z.object({
  bookId: z.string().cuid(),
  note: z.string().max(190).optional(),
});

export const approveSchema = z.object({
  bookCopyId: z.string().cuid().optional(),
  note: z.string().max(190).optional(),
});

export const rejectSchema = z.object({
  note: z.string().max(190).optional(),
});

export const listRequestsQuery = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
});

import { z } from "zod";

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["SUBJECT", "WATTPAD", "GENRE"]).optional(),
  description: z.string().max(500).optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();
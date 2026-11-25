import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().cuid(),
});

export const idBodySchema = z.object({
  id: z.string().cuid(),
});
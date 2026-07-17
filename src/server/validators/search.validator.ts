import { z } from "zod";

export const globalSearchSchema = z.object({
  query: z.string().trim().min(1, "Search query is required"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type GlobalSearchInput = z.infer<typeof globalSearchSchema>;

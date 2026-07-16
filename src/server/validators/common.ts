import { z } from "zod";

export const idSchema = z.string().min(1, "ID is required");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().optional(),
});

export const dateSchema = z.coerce.date();

export const optionalDateSchema = z.coerce.date().optional().nullable();

export const positiveDecimalSchema = z.coerce
  .number()
  .nonnegative("Amount must be non-negative")
  .or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number));

export const phoneSchema = z.string().trim().min(10).max(15).optional().nullable();

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join("; ");
    throw new Error(message || "Validation failed");
  }
  return result.data;
}

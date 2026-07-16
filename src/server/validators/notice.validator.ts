import { NoticeAudience } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema, paginationSchema } from "./common";

export const createNoticeSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  audience: z.nativeEnum(NoticeAudience).default(NoticeAudience.ALL),
  publishedAt: dateSchema.optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateNoticeSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional(),
  audience: z.nativeEnum(NoticeAudience).optional(),
  publishedAt: dateSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

export const listNoticesSchema = paginationSchema.extend({
  audience: z.nativeEnum(NoticeAudience).optional(),
  activeOnly: z.coerce.boolean().optional(),
});

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>;

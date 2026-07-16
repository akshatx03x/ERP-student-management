import { SessionStatus } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema, paginationSchema } from "./common";

const sessionBaseSchema = z.object({
  name: z.string().trim().min(1),
  startDate: dateSchema,
  endDate: dateSchema,
  status: z.nativeEnum(SessionStatus),
});

export const createSessionSchema = sessionBaseSchema
  .extend({
    status: z.nativeEnum(SessionStatus).default(SessionStatus.DRAFT),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

export const updateSessionSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    status: z.nativeEnum(SessionStatus).optional(),
  })
  .refine(
    (d) =>
      d.startDate == null ||
      d.endDate == null ||
      d.endDate >= d.startDate,
    {
      message: "End date must be on or after start date",
      path: ["endDate"],
    },
  );

export const sessionIdSchema = z.object({ sessionId: idSchema });

export const promoteStudentsSchema = z.object({
  fromSessionId: idSchema,
  toSessionId: idSchema,
  mappings: z
    .array(
      z.object({
        studentId: idSchema,
        toClassId: idSchema,
        toSectionId: idSchema,
        rollNo: z.string().trim().optional().nullable(),
        notes: z.string().trim().optional().nullable(),
      }),
    )
    .min(1),
});

export const listSessionsSchema = paginationSchema;

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type PromoteStudentsInput = z.infer<typeof promoteStudentsSchema>;

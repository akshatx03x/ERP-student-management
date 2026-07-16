import { AttendanceStatus } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema } from "./common";

export const markAttendanceSchema = z.object({
  sessionId: idSchema,
  sectionId: idSchema,
  date: dateSchema,
  records: z
    .array(
      z.object({
        studentId: idSchema,
        status: z.nativeEnum(AttendanceStatus),
        remarks: z.string().trim().optional().nullable(),
      }),
    )
    .min(1),
});

export const monthlySummarySchema = z.object({
  sessionId: idSchema,
  studentId: idSchema.optional(),
  sectionId: idSchema.optional(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const listAttendanceSchema = z.object({
  sessionId: idSchema,
  sectionId: idSchema,
  date: dateSchema,
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type MonthlySummaryInput = z.infer<typeof monthlySummarySchema>;

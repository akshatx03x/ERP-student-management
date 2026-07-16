import { z } from "zod";
import { dateSchema, idSchema, paginationSchema, positiveDecimalSchema } from "./common";

export const createExamTypeSchema = z.object({
  sessionId: idSchema,
  name: z.string().trim().min(1),
});

export const createExamSchema = z.object({
  sessionId: idSchema,
  examTypeId: idSchema,
  classId: idSchema,
  name: z.string().trim().min(1),
  startDate: dateSchema.optional().nullable(),
  endDate: dateSchema.optional().nullable(),
});

export const createExamSubjectSchema = z
  .object({
    examId: idSchema,
    subjectId: idSchema,
    maxMarks: positiveDecimalSchema,
    passMarks: positiveDecimalSchema,
  })
  .refine((d) => Number(d.maxMarks) > 0, {
    message: "Max marks must be greater than zero",
    path: ["maxMarks"],
  });

export const markEntrySchema = z.object({
  examSubjectId: idSchema,
  entries: z
    .array(
      z.object({
        studentId: idSchema,
        marksObtained: positiveDecimalSchema,
        remarks: z.string().trim().optional().nullable(),
      }),
    )
    .min(1),
});

export const generateReportCardSchema = z.object({
  studentId: idSchema,
  sessionId: idSchema,
  examId: idSchema.optional().nullable(),
});

export const listExamsSchema = paginationSchema.extend({
  sessionId: idSchema.optional(),
  classId: idSchema.optional(),
});

export type CreateExamTypeInput = z.infer<typeof createExamTypeSchema>;
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type CreateExamSubjectInput = z.infer<typeof createExamSubjectSchema>;
export type MarkEntryInput = z.infer<typeof markEntrySchema>;
export type GenerateReportCardInput = z.infer<typeof generateReportCardSchema>;

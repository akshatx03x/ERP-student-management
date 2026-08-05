import { z } from "zod";
import { idSchema, paginationSchema } from "./common";

export const listTCsSchema = paginationSchema.extend({
  search: z.string().optional(),
  sessionId: z.string().optional(),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  status: z.enum(["DRAFT", "ISSUED", "CANCELLED"]).optional(),
});

export const generateTCSchema = z.object({
  studentId: idSchema,
  sessionId: z.string().optional(),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  attendance: z.string().optional(),
  conduct: z.string().optional().default("Good"),
  remarks: z.string().optional(),
  dateOfIssue: z.coerce.date().optional(),
});

export const updateTCSchema = z.object({
  tcId: idSchema,
  attendance: z.string().optional(),
  conduct: z.string().optional(),
  remarks: z.string().optional(),
  dateOfIssue: z.coerce.date().optional(),
});

export const tcStatusActionSchema = z.object({
  tcId: idSchema,
  action: z.enum(["issue", "undoIssue", "cancel"]),
});

export type ListTCsInput = z.infer<typeof listTCsSchema>;
export type GenerateTCInput = z.infer<typeof generateTCSchema>;
export type UpdateTCInput = z.infer<typeof updateTCSchema>;
export type TCStatusActionInput = z.infer<typeof tcStatusActionSchema>;

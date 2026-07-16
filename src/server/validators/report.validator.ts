import { z } from "zod";
import { idSchema } from "./common";

export const attendanceReportSchema = z.object({
  sessionId: idSchema,
  sectionId: idSchema.optional(),
  classId: idSchema.optional(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
});

export const feeReportSchema = z.object({
  sessionId: idSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  classId: idSchema.optional(),
});

export const studentReportSchema = z.object({
  sessionId: idSchema.optional(),
  classId: idSchema.optional(),
  sectionId: idSchema.optional(),
  status: z.string().optional(),
});

export const admissionReportSchema = z.object({
  sessionId: idSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export const academicReportSchema = z.object({
  sessionId: idSchema,
  examId: idSchema.optional(),
  classId: idSchema.optional(),
});

export type AttendanceReportInput = z.infer<typeof attendanceReportSchema>;
export type FeeReportInput = z.infer<typeof feeReportSchema>;
export type StudentReportInput = z.infer<typeof studentReportSchema>;
export type AdmissionReportInput = z.infer<typeof admissionReportSchema>;
export type AcademicReportInput = z.infer<typeof academicReportSchema>;

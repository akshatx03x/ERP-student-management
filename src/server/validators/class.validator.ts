import { z } from "zod";
import { idSchema, paginationSchema } from "./common";

export const createClassSchema = z.object({
  name: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateClassSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const createSectionSchema = z.object({
  classId: idSchema,
  name: z.string().trim().min(1),
});

export const updateSectionSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).optional(),
});

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1).max(20),
});

export const updateSubjectSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).max(20).optional(),
});

export const assignClassSubjectSchema = z.object({
  sessionId: idSchema,
  classId: idSchema,
  subjectId: idSchema,
});

export const assignClassTeacherSchema = z.object({
  sessionId: idSchema,
  sectionId: idSchema,
  staffProfileId: idSchema,
});

export const listClassSchema = paginationSchema.extend({
  sessionId: idSchema.optional(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
export type AssignClassSubjectInput = z.infer<typeof assignClassSubjectSchema>;
export type AssignClassTeacherInput = z.infer<typeof assignClassTeacherSchema>;

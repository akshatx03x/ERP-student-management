import { z } from "zod";
import { dateSchema, idSchema, paginationSchema } from "./common";

export const createHomeworkSchema = z.object({
  sessionId: idSchema,
  sectionId: idSchema,
  subjectId: idSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  dueDate: dateSchema,
  documentIds: z.array(idSchema).optional(),
});

export const listHomeworkSchema = paginationSchema.extend({
  sessionId: idSchema.optional(),
  sectionId: idSchema.optional(),
  studentId: idSchema.optional(),
});

export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;

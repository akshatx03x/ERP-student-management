import { DayOfWeek } from "@prisma/client";
import { z } from "zod";
import { idSchema } from "./common";

export const createTimetableSlotSchema = z.object({
  sessionId: idSchema,
  sectionId: idSchema,
  dayOfWeek: z.nativeEnum(DayOfWeek),
  periodNumber: z.coerce.number().int().min(1).max(12),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  subjectId: idSchema,
  staffProfileId: idSchema,
});

export const updateTimetableSlotSchema = z.object({
  id: idSchema,
  sessionId: idSchema.optional(),
  sectionId: idSchema.optional(),
  dayOfWeek: z.nativeEnum(DayOfWeek).optional(),
  periodNumber: z.coerce.number().int().min(1).max(12).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM").optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM").optional(),
  subjectId: idSchema.optional(),
  staffProfileId: idSchema.optional(),
});

export const timetableViewSchema = z.object({
  sessionId: idSchema,
  sectionId: idSchema.optional(),
  staffProfileId: idSchema.optional(),
  studentId: idSchema.optional(),
});

export type CreateTimetableSlotInput = z.infer<typeof createTimetableSlotSchema>;
export type UpdateTimetableSlotInput = z.infer<typeof updateTimetableSlotSchema>;
export type TimetableViewInput = z.infer<typeof timetableViewSchema>;

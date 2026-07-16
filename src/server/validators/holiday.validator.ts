import { HolidayType } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema, paginationSchema } from "./common";

export const createHolidaySchema = z.object({
  date: dateSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  type: z.nativeEnum(HolidayType).default(HolidayType.SCHOOL),
});

export const updateHolidaySchema = z.object({
  id: idSchema,
  date: dateSchema.optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  type: z.nativeEnum(HolidayType).optional(),
});

export const listHolidaysSchema = paginationSchema.extend({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;

import { Role } from "@prisma/client";
import { z } from "zod";
import { idSchema, paginationSchema, phoneSchema } from "./common";

const staffRoleSchema = z.enum([Role.ACCOUNTANT, Role.TEACHER]);

export const createStaffSchema = z.object({
  employeeCode: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  phone: phoneSchema,
  designation: z.string().trim().optional().nullable(),
  role: staffRoleSchema,
  createLogin: z.boolean().default(false),
  password: z.string().min(6).optional(),
});

export const updateStaffSchema = z.object({
  id: idSchema,
  fullName: z.string().trim().min(1).optional(),
  phone: phoneSchema,
  designation: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const createStaffLoginSchema = z.object({
  staffProfileId: idSchema,
  password: z.string().min(6).optional(),
});

export const listStaffSchema = paginationSchema.extend({
  role: staffRoleSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type CreateStaffLoginInput = z.infer<typeof createStaffLoginSchema>;

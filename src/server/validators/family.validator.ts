import { z } from "zod";
import { idSchema, paginationSchema, phoneSchema } from "./common";

export const createFamilySchema = z.object({
  familyCode: z.string().trim().optional().nullable(),
  fatherName: z.string().trim().optional().nullable(),
  motherName: z.string().trim().optional().nullable(),
  guardianName: z.string().trim().optional().nullable(),
  primaryPhone: phoneSchema,
  secondaryPhone: phoneSchema,
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  addressLine1: z.string().trim().optional().nullable(),
  addressLine2: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
});

export const updateFamilySchema = z.object({
  id: idSchema,
  familyCode: z.string().trim().optional().nullable(),
  fatherName: z.string().trim().optional().nullable(),
  motherName: z.string().trim().optional().nullable(),
  guardianName: z.string().trim().optional().nullable(),
  primaryPhone: phoneSchema,
  secondaryPhone: phoneSchema,
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  addressLine1: z.string().trim().optional().nullable(),
  addressLine2: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
});

export const listFamiliesSchema = paginationSchema;

export type CreateFamilyInput = z.infer<typeof createFamilySchema>;
export type UpdateFamilyInput = z.infer<typeof updateFamilySchema>;

import { AdmissionStatus, Gender } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema, paginationSchema } from "./common";

export const createAdmissionSchema = z.object({
  sessionId: idSchema,
  familyId: idSchema.optional().nullable(),
  applicantName: z.string().trim().min(1),
  dateOfBirth: dateSchema,
  gender: z.nativeEnum(Gender).optional().nullable(),
  appliedClassId: idSchema,
  fatherName: z.string().trim().optional().nullable(),
  motherName: z.string().trim().optional().nullable(),
  guardianName: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
});

export const updateAdmissionSchema = z.object({
  id: idSchema,
  applicantName: z.string().trim().min(1).optional(),
  dateOfBirth: dateSchema.optional(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  appliedClassId: idSchema.optional(),
  fatherName: z.string().trim().optional().nullable(),
  motherName: z.string().trim().optional().nullable(),
  guardianName: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
});

export const reviewAdmissionSchema = z.object({
  id: idSchema,
  remarks: z.string().trim().optional().nullable(),
  sectionId: idSchema.optional(),
  familyId: idSchema.optional(),
});

export const listAdmissionsSchema = paginationSchema.extend({
  sessionId: idSchema.optional(),
  status: z.nativeEnum(AdmissionStatus).optional(),
});

export type CreateAdmissionInput = z.infer<typeof createAdmissionSchema>;
export type UpdateAdmissionInput = z.infer<typeof updateAdmissionSchema>;
export type ReviewAdmissionInput = z.infer<typeof reviewAdmissionSchema>;

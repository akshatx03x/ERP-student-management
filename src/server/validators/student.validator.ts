import { EnrollmentStatus, Gender, StudentStatus } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema, paginationSchema } from "./common";

export const createStudentSchema = z.object({
  familyId: idSchema,
  admissionNo: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  middleName: z.string().trim().optional().nullable(),
  lastName: z.string().trim().optional().nullable(),
  dateOfBirth: dateSchema,
  gender: z.nativeEnum(Gender).optional().nullable(),
  bloodGroup: z.string().trim().optional().nullable(),
  aadhaar: z.string().trim().optional().nullable(),
  status: z.nativeEnum(StudentStatus).default(StudentStatus.ACTIVE),
  createLogin: z.boolean().default(true),
});

/** Create student with parent details — family is created or linked automatically. */
export const createStudentWithFamilySchema = z.object({
  admissionNo: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  middleName: z.string().trim().optional().nullable(),
  lastName: z.string().trim().optional().nullable(),
  dateOfBirth: dateSchema,
  gender: z.nativeEnum(Gender).optional().nullable(),
  bloodGroup: z.string().trim().optional().nullable(),
  aadhaar: z.string().trim().optional().nullable(),
  status: z.nativeEnum(StudentStatus).default(StudentStatus.ACTIVE),
  createLogin: z.boolean().default(true),
  fatherName: z.string().trim().optional().nullable(),
  motherName: z.string().trim().optional().nullable(),
  guardianName: z.string().trim().optional().nullable(),
  phone: z.string().trim().min(1),
  address: z.string().trim().optional().nullable(),
  /** When set, link to this family instead of creating a new one. */
  familyId: idSchema.optional().nullable(),
  enroll: z.boolean().default(true),
  sessionId: idSchema.optional().nullable(),
  classId: idSchema.optional().nullable(),
  sectionId: idSchema.optional().nullable(),
  rollNo: z.string().trim().optional().nullable(),
});

/** Move sibling students onto the primary student's family. */
export const mergeSiblingsSchema = z.object({
  primaryStudentId: idSchema,
  siblingStudentIds: z.array(idSchema).min(1),
});

export const updateStudentSchema = z.object({
  id: idSchema,
  firstName: z.string().trim().min(1).optional(),
  middleName: z.string().trim().optional().nullable(),
  lastName: z.string().trim().optional().nullable(),
  dateOfBirth: dateSchema.optional(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  bloodGroup: z.string().trim().optional().nullable(),
  aadhaar: z.string().trim().optional().nullable(),
  status: z.nativeEnum(StudentStatus).optional(),
});

export const createEnrollmentSchema = z.object({
  studentId: idSchema,
  sessionId: idSchema,
  classId: idSchema,
  sectionId: idSchema,
  rollNo: z.string().trim().optional().nullable(),
  status: z.nativeEnum(EnrollmentStatus).default(EnrollmentStatus.ACTIVE),
});

export const updateEnrollmentSchema = z.object({
  id: idSchema,
  classId: idSchema.optional(),
  sectionId: idSchema.optional(),
  rollNo: z.string().trim().optional().nullable(),
  status: z.nativeEnum(EnrollmentStatus).optional(),
});

export const upsertMedicalSchema = z.object({
  studentId: idSchema,
  allergies: z.string().trim().optional().nullable(),
  conditions: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const listStudentsSchema = paginationSchema.extend({
  familyId: idSchema.optional(),
  status: z.nativeEnum(StudentStatus).optional(),
  sessionId: idSchema.optional(),
  classId: idSchema.optional(),
  sectionId: idSchema.optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type CreateStudentWithFamilyInput = z.infer<typeof createStudentWithFamilySchema>;
export type MergeSiblingsInput = z.infer<typeof mergeSiblingsSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
export type UpsertMedicalInput = z.infer<typeof upsertMedicalSchema>;

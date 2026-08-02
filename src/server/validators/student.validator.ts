import { EnrollmentStatus, Gender, StudentCategory, StudentStatus, ExitReason, ContactOwner } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema, paginationSchema } from "./common";

export const createStudentSchema = z.object({
  familyId: idSchema,
  admissionNo: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  middleName: z.string().trim().optional().nullable(),
  lastName: z.string().trim().optional().nullable(),
  dateOfBirth: dateSchema.optional().nullable(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  bloodGroup: z.string().trim().optional().nullable(),
  aadhaar: z.string().trim().optional().nullable(),
  religion: z.string().trim().optional().nullable(),
  category: z.nativeEnum(StudentCategory).optional().nullable(),
  apaarId: z.string().trim().optional().nullable(),
  penId: z.string().trim().optional().nullable(),
  previousSchoolName: z.string().trim().optional().nullable(),
  previousClass: z.string().trim().optional().nullable(),
  tcNumber: z.string().trim().optional().nullable(),
  tcDate: dateSchema.optional().nullable(),
  transportRequired: z.boolean().optional().default(false),
  transportPickupPoint: z.string().trim().optional().nullable(),
  admissionDate: dateSchema.optional().nullable(),
  photoDocumentId: z.string().trim().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  status: z.nativeEnum(StudentStatus).default(StudentStatus.ACTIVE),
  createLogin: z.boolean().default(true),
  allowDuplicate: z.boolean().optional().default(false),
});

/** Create student with parent details — family is created or linked automatically. */
export const createStudentWithFamilySchema = z.object({
  admissionNo: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  middleName: z.string().trim().optional().nullable(),
  lastName: z.string().trim().optional().nullable(),
  dateOfBirth: dateSchema.optional().nullable(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  bloodGroup: z.string().trim().optional().nullable(),
  aadhaar: z.string().trim().optional().nullable(),
  religion: z.string().trim().optional().nullable(),
  category: z.nativeEnum(StudentCategory).optional().nullable(),
  apaarId: z.string().trim().optional().nullable(),
  penId: z.string().trim().optional().nullable(),
  srNo: z.string().trim().optional().nullable(),
  status: z.nativeEnum(StudentStatus).default(StudentStatus.ACTIVE),
  createLogin: z.boolean().default(true),

  fatherName: z.string().trim().optional().nullable(),
  fatherQualification: z.string().trim().optional().nullable(),
  fatherOccupation: z.string().trim().optional().nullable(),
  fatherDesignation: z.string().trim().optional().nullable(),
  fatherAnnualIncome: z.number().optional().nullable(),
  fatherOfficeAddress: z.string().trim().optional().nullable(),
  fatherPhone: z.string().trim().optional().nullable(),
  fatherAadhaar: z.string().trim().optional().nullable(),
  fatherEmail: z.string().trim().optional().nullable(),

  motherName: z.string().trim().optional().nullable(),
  motherQualification: z.string().trim().optional().nullable(),
  motherIsWorking: z.boolean().optional().nullable(),
  motherOccupation: z.string().trim().optional().nullable(),
  motherDesignation: z.string().trim().optional().nullable(),
  motherAnnualIncome: z.number().optional().nullable(),
  motherOfficeAddress: z.string().trim().optional().nullable(),
  motherPhone: z.string().trim().optional().nullable(),
  motherAadhaar: z.string().trim().optional().nullable(),
  motherEmail: z.string().trim().optional().nullable(),

  guardianName: z.string().trim().optional().nullable(),
  phone: z.string().trim().min(1),
  secondaryPhone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),

  resAddressLine1: z.string().trim().optional().nullable(),
  resAddressLine2: z.string().trim().optional().nullable(),
  resCity: z.string().trim().optional().nullable(),
  resState: z.string().trim().optional().nullable(),
  resPincode: z.string().trim().optional().nullable(),
  sameAsResidential: z.boolean().default(true),
  permAddressLine1: z.string().trim().optional().nullable(),
  permAddressLine2: z.string().trim().optional().nullable(),
  permCity: z.string().trim().optional().nullable(),
  permState: z.string().trim().optional().nullable(),
  permPincode: z.string().trim().optional().nullable(),

  previousSchoolName: z.string().trim().optional().nullable(),
  previousClass: z.string().trim().optional().nullable(),
  tcNumber: z.string().trim().optional().nullable(),
  tcDate: dateSchema.optional().nullable(),

  transportRequired: z.boolean().default(false),
  transportPickupPoint: z.string().trim().optional().nullable(),

  declarationAccepted: z.boolean().default(false),
  declarationDate: dateSchema.optional().nullable(),
  declarationParentName: z.string().trim().optional().nullable(),
  admissionDate: dateSchema.optional().nullable(),
  photoDocumentId: z.string().trim().optional().nullable(),
  photoUrl: z.string().optional().nullable(),

  /** When set, link to this family instead of creating a new one. */
  familyId: idSchema.optional().nullable(),
  enroll: z.boolean().default(true),
  sessionId: idSchema.optional().nullable(),
  classId: idSchema.optional().nullable(),
  sectionId: idSchema.optional().nullable(),
  rollNo: z.string().trim().optional().nullable(),
  allowDuplicate: z.boolean().optional().default(false),
  fatherPhotoUrl: z.string().optional().nullable(),
  motherPhotoUrl: z.string().optional().nullable(),
  primaryPhoneBelongsTo: z.nativeEnum(ContactOwner).optional().nullable(),
  secondaryPhoneBelongsTo: z.nativeEnum(ContactOwner).optional().nullable(),
  fatherWhatsApp: z.string().trim().optional().nullable(),
  motherWhatsApp: z.string().trim().optional().nullable(),
  transportRoute: z.string().trim().optional().nullable(),
  transportVehicle: z.string().trim().optional().nullable(),
  transportDriver: z.string().trim().optional().nullable(),
  transportDriverContact: z.string().trim().optional().nullable(),
  previousBoard: z.string().trim().optional().nullable(),
  previousReason: z.string().trim().optional().nullable(),
  allergies: z.string().trim().optional().nullable(),
  conditions: z.string().trim().optional().nullable(),
  disability: z.string().trim().optional().nullable(),
  emergencyRemarks: z.string().trim().optional().nullable(),
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
  religion: z.string().trim().optional().nullable(),
  category: z.nativeEnum(StudentCategory).optional().nullable(),
  apaarId: z.string().trim().optional().nullable(),
  penId: z.string().trim().optional().nullable(),
  previousSchoolName: z.string().trim().optional().nullable(),
  previousClass: z.string().trim().optional().nullable(),
  tcNumber: z.string().trim().optional().nullable(),
  tcDate: dateSchema.optional().nullable(),
  transportRequired: z.boolean().optional(),
  transportPickupPoint: z.string().trim().optional().nullable(),
  admissionDate: dateSchema.optional().nullable(),
  photoDocumentId: z.string().trim().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  srNo: z.string().trim().optional().nullable(),
  primaryPhone: z.string().trim().optional().nullable(),
  classId: idSchema.optional().nullable(),
  sectionId: idSchema.optional().nullable(),
  familyId: idSchema.optional().nullable(),
  unlinkFamily: z.boolean().optional(),
  exitReason: z.nativeEnum(ExitReason).optional().nullable(),
  status: z.nativeEnum(StudentStatus).optional(),
  
  // New edit profile / section fields
  fatherName: z.string().trim().optional().nullable(),
  fatherQualification: z.string().trim().optional().nullable(),
  fatherOccupation: z.string().trim().optional().nullable(),
  fatherDesignation: z.string().trim().optional().nullable(),
  fatherAnnualIncome: z.number().optional().nullable(),
  fatherOfficeAddress: z.string().trim().optional().nullable(),
  fatherPhone: z.string().trim().optional().nullable(),
  fatherAadhaar: z.string().trim().optional().nullable(),
  fatherEmail: z.string().trim().optional().nullable(),
  fatherWhatsApp: z.string().trim().optional().nullable(),
  fatherPhotoUrl: z.string().optional().nullable(),

  motherName: z.string().trim().optional().nullable(),
  motherQualification: z.string().trim().optional().nullable(),
  motherIsWorking: z.boolean().optional().nullable(),
  motherOccupation: z.string().trim().optional().nullable(),
  motherDesignation: z.string().trim().optional().nullable(),
  motherAnnualIncome: z.number().optional().nullable(),
  motherOfficeAddress: z.string().trim().optional().nullable(),
  motherPhone: z.string().trim().optional().nullable(),
  motherAadhaar: z.string().trim().optional().nullable(),
  motherEmail: z.string().trim().optional().nullable(),
  motherWhatsApp: z.string().trim().optional().nullable(),
  motherPhotoUrl: z.string().optional().nullable(),

  primaryPhoneBelongsTo: z.nativeEnum(ContactOwner).optional().nullable(),
  secondaryPhone: z.string().trim().optional().nullable(),
  secondaryPhoneBelongsTo: z.nativeEnum(ContactOwner).optional().nullable(),

  addressLine1: z.string().trim().optional().nullable(),
  addressLine2: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
  permAddressLine1: z.string().trim().optional().nullable(),
  permAddressLine2: z.string().trim().optional().nullable(),
  permCity: z.string().trim().optional().nullable(),
  permState: z.string().trim().optional().nullable(),
  permPincode: z.string().trim().optional().nullable(),
  sameAsResidential: z.boolean().optional(),

  transportRoute: z.string().trim().optional().nullable(),
  transportVehicle: z.string().trim().optional().nullable(),
  transportDriver: z.string().trim().optional().nullable(),
  transportDriverContact: z.string().trim().optional().nullable(),

  previousBoard: z.string().trim().optional().nullable(),
  previousReason: z.string().trim().optional().nullable(),

  allergies: z.string().trim().optional().nullable(),
  conditions: z.string().trim().optional().nullable(),
  disability: z.string().trim().optional().nullable(),
  emergencyRemarks: z.string().trim().optional().nullable(),

  // Guardians
  guardian1Id: z.string().optional().nullable(),
  guardian1Name: z.string().trim().optional().nullable(),
  guardian1Relation: z.string().trim().optional().nullable(),
  guardian1Phone: z.string().trim().optional().nullable(),
  guardian1WhatsApp: z.string().trim().optional().nullable(),
  guardian1Occupation: z.string().trim().optional().nullable(),
  guardian1Address: z.string().trim().optional().nullable(),
  guardian1PhotoUrl: z.string().optional().nullable(),

  guardian2Id: z.string().optional().nullable(),
  guardian2Name: z.string().trim().optional().nullable(),
  guardian2Relation: z.string().trim().optional().nullable(),
  guardian2Phone: z.string().trim().optional().nullable(),
  guardian2WhatsApp: z.string().trim().optional().nullable(),
  guardian2Occupation: z.string().trim().optional().nullable(),
  guardian2Address: z.string().trim().optional().nullable(),
  guardian2PhotoUrl: z.string().optional().nullable(),
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
  disability: z.string().trim().optional().nullable(),
  emergencyRemarks: z.string().trim().optional().nullable(),
});

export const listStudentsSchema = paginationSchema.extend({
  familyId: idSchema.optional(),
  status: z.nativeEnum(StudentStatus).optional(),
  sessionId: idSchema.optional(),
  classId: idSchema.optional(),
  sectionId: idSchema.optional(),
});

export type CreateStudentInput = z.input<typeof createStudentSchema>;
export type CreateStudentWithFamilyInput = z.input<typeof createStudentWithFamilySchema>;
export type MergeSiblingsInput = z.input<typeof mergeSiblingsSchema>;
export type UpdateStudentInput = z.input<typeof updateStudentSchema>;
export type CreateEnrollmentInput = z.input<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.input<typeof updateEnrollmentSchema>;
export type UpsertMedicalInput = z.input<typeof upsertMedicalSchema>;

import { AdmissionStatus, Gender, StudentCategory } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema, paginationSchema } from "./common";

export const createAdmissionSchema = z.object({
  sessionId: idSchema,
  familyId: idSchema.optional().nullable(),
  applicantName: z.string().trim().min(1),
  dateOfBirth: dateSchema,
  gender: z.nativeEnum(Gender).optional().nullable(),
  religion: z.string().trim().optional().nullable(),
  category: z.nativeEnum(StudentCategory).optional().nullable(),
  aadhaar: z.string().trim().optional().nullable(),
  apaarId: z.string().trim().optional().nullable(),
  penId: z.string().trim().optional().nullable(),
  srNo: z.string().trim().optional().nullable(),
  appliedClassId: idSchema,
  
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
  phone: z.string().trim().optional().nullable(),
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
  admissionNo: z.string().trim().optional().nullable(),
  photoDocumentId: z.string().trim().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  allowDuplicate: z.boolean().optional().default(false),
});

export const updateAdmissionSchema = createAdmissionSchema.partial().extend({
  id: idSchema,
});

export const reviewAdmissionSchema = z.object({
  id: idSchema,
  remarks: z.string().trim().optional().nullable(),
  sectionId: idSchema.optional(),
  familyId: idSchema.optional(),
  admissionNo: z.string().trim().optional().nullable(),
});

export const listAdmissionsSchema = paginationSchema.extend({
  sessionId: idSchema.optional(),
  status: z.nativeEnum(AdmissionStatus).optional(),
});

export type CreateAdmissionInput = z.infer<typeof createAdmissionSchema>;
export type UpdateAdmissionInput = z.infer<typeof updateAdmissionSchema>;
export type ReviewAdmissionInput = z.infer<typeof reviewAdmissionSchema>;


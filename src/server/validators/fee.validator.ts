import { FeeFrequency, PaymentMethod, StudentFeeStatus } from "@prisma/client";
import { z } from "zod";
import { idSchema, paginationSchema, positiveDecimalSchema } from "./common";

export const createFeeHeadSchema = z.object({
  name: z.string().trim().min(1),
  frequency: z.nativeEnum(FeeFrequency).default(FeeFrequency.ANNUAL),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateFeeHeadSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).optional(),
  frequency: z.nativeEnum(FeeFrequency).optional(),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const createFeeStructureSchema = z.object({
  sessionId: idSchema,
  classId: idSchema,
  name: z.string().trim().min(1).optional(),
  items: z
    .array(
      z.object({
        feeHeadId: idSchema,
        amount: positiveDecimalSchema,
      }),
    )
    .min(1, "Add at least one fee head"),
});

export const updateFeeStructureSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).optional(),
  items: z
    .array(
      z.object({
        feeHeadId: idSchema,
        amount: positiveDecimalSchema,
      }),
    )
    .min(1, "Add at least one fee head"),
});

export const createStudentFeeSchema = z.object({
  studentId: idSchema,
  feeHeadId: idSchema,
  sessionId: idSchema,
  amount: positiveDecimalSchema,
  dueDate: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(StudentFeeStatus).default(StudentFeeStatus.PENDING),
  remarks: z.string().trim().optional().nullable(),
});

export const recordPaymentSchema = z
  .object({
    familyId: idSchema,
    amount: positiveDecimalSchema,
    method: z.nativeEnum(PaymentMethod),
    referenceNo: z.string().trim().optional().nullable(),
    paidAt: z.coerce.date().optional(),
    notes: z.string().trim().optional().nullable(),
    allocations: z
      .array(
        z.object({
          studentId: idSchema,
          studentFeeId: idSchema.optional().nullable(),
          amount: positiveDecimalSchema,
        }),
      )
      .min(1),
  })
  .refine((d) => Number(d.amount) > 0, {
    message: "Payment amount must be greater than zero",
    path: ["amount"],
  })
  .refine((d) => d.allocations.every((a) => Number(a.amount) > 0), {
    message: "Allocation amount must be greater than zero",
    path: ["allocations"],
  });

export const listStudentFeesSchema = paginationSchema.extend({
  sessionId: idSchema.optional(),
  studentId: idSchema.optional(),
  familyId: idSchema.optional(),
  status: z.nativeEnum(StudentFeeStatus).optional(),
});

export const listPaymentsSchema = paginationSchema.extend({
  familyId: idSchema.optional(),
});

export type CreateFeeHeadInput = z.infer<typeof createFeeHeadSchema>;
export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;
export type UpdateFeeStructureInput = z.infer<typeof updateFeeStructureSchema>;
export type CreateStudentFeeInput = z.infer<typeof createStudentFeeSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

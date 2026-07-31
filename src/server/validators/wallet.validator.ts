import { AdvanceTransactionType } from "@prisma/client";
import { z } from "zod";
import { idSchema, paginationSchema, positiveDecimalSchema } from "./common";

export const getOrCreateWalletSchema = z.object({
  familyId: idSchema,
});

export const getWalletSchema = z.object({
  familyId: idSchema,
});

export const recordWalletTransactionSchema = z.object({
  familyId: idSchema,
  type: z.nativeEnum(AdvanceTransactionType),
  amount: positiveDecimalSchema,
  reason: z.string().trim().min(1, "Reason is required"),
  remarks: z.string().trim().optional().nullable(),
  paymentId: idSchema.optional().nullable(),
  targetStudentId: idSchema.optional().nullable(),
  targetStudentFeeId: idSchema.optional().nullable(),
});

export const listWalletTransactionsSchema = paginationSchema.extend({
  familyId: idSchema,
});

export const refundWalletSchema = z.object({
  familyId: idSchema,
  amount: positiveDecimalSchema,
  reason: z.string().trim().min(1, "Reason is required"),
  remarks: z.string().trim().optional().nullable(),
});

export const manualAdjustmentSchema = z.object({
  familyId: idSchema,
  type: z.nativeEnum(AdvanceTransactionType),
  amount: positiveDecimalSchema,
  reason: z.string().trim().min(1, "Reason is required"),
  remarks: z.string().trim().optional().nullable(),
});

export type GetOrCreateWalletInput = z.infer<typeof getOrCreateWalletSchema>;
export type GetWalletInput = z.infer<typeof getWalletSchema>;
export type RecordWalletTransactionInput = z.infer<typeof recordWalletTransactionSchema>;
export type ListWalletTransactionsInput = z.infer<typeof listWalletTransactionsSchema>;
export type RefundWalletInput = z.infer<typeof refundWalletSchema>;
export type ManualAdjustmentInput = z.infer<typeof manualAdjustmentSchema>;

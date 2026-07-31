import { DiscountCategory, DiscountType, FeeMonth } from "@prisma/client";
import { z } from "zod";
import { idSchema, paginationSchema, positiveDecimalSchema } from "./common";

export const createFeeDiscountSchema = z
  .object({
    studentId: idSchema,
    sessionId: idSchema,
    feeHeadId: idSchema.optional().nullable(),
    month: z.nativeEnum(FeeMonth).optional().nullable(),
    discountType: z.nativeEnum(DiscountType),
    value: positiveDecimalSchema,
    category: z.nativeEnum(DiscountCategory),
    reason: z.string().trim().min(1, "Reason is required"),
    remarks: z.string().trim().optional().nullable(),
    effectiveFrom: z.coerce.date().optional(),
    effectiveTill: z.coerce.date().optional().nullable(),
  })
  .refine(
    (d) => {
      if (d.discountType === DiscountType.PERCENTAGE) {
        const val = Number(d.value);
        return val > 0 && val <= 100;
      }
      return true;
    },
    { message: "Percentage discount must be between 0 and 100", path: ["value"] },
  );

export const revokeFeeDiscountSchema = z.object({
  discountId: idSchema,
  reason: z.string().trim().min(1, "Revocation reason is required"),
});

export const listStudentDiscountsSchema = paginationSchema.extend({
  studentId: idSchema.optional(),
  sessionId: idSchema.optional(),
});

export type CreateFeeDiscountInput = z.infer<typeof createFeeDiscountSchema>;
export type RevokeFeeDiscountInput = z.infer<typeof revokeFeeDiscountSchema>;
export type ListStudentDiscountsInput = z.infer<typeof listStudentDiscountsSchema>;

import { LateFeeCalculationType } from "@prisma/client";
import { z } from "zod";
import { idSchema, paginationSchema, positiveDecimalSchema } from "./common";

const feeLateRuleBaseSchema = z.object({
  sessionId: idSchema,
  name: z.string().trim().min(1, "Rule name is required"),
  isActive: z.boolean().default(true),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTill: z.coerce.date().optional().nullable(),
  graceDays: z.number().int().min(0, "Grace days cannot be negative").default(0),
  calculationType: z.nativeEnum(LateFeeCalculationType),
  fixedAmount: positiveDecimalSchema.optional().nullable(),
  percentage: positiveDecimalSchema.optional().nullable(),
  applyPerDay: positiveDecimalSchema.optional().nullable(),
  applyPerMonth: positiveDecimalSchema.optional().nullable(),
  maxFine: positiveDecimalSchema.optional().nullable(),
  applicableFeeHeadIds: z.array(idSchema).optional().nullable(),
  priority: z.number().int().default(0),
});

export const createFeeLateRuleSchema = feeLateRuleBaseSchema.refine(
  (d) => {
    if (d.calculationType === LateFeeCalculationType.PERCENTAGE) {
      const val = Number(d.percentage ?? 0);
      return val > 0 && val <= 100;
    }
    return true;
  },
  { message: "Percentage fine must be between 0 and 100", path: ["percentage"] },
);

export const updateFeeLateRuleSchema = feeLateRuleBaseSchema.partial().extend({
  id: idSchema,
});

export const waiveStudentFineSchema = z.object({
  studentFeeFineId: idSchema,
  waiveAmount: positiveDecimalSchema.optional().nullable(),
  fullWaiver: z.boolean().optional().default(false),
  reason: z.string().trim().min(1, "Waiver reason is required"),
  remarks: z.string().trim().optional().nullable(),
});

export const listFeeLateRulesSchema = paginationSchema.extend({
  sessionId: idSchema.optional(),
  isActive: z.boolean().optional(),
});

export type CreateFeeLateRuleInput = z.infer<typeof createFeeLateRuleSchema>;
export type UpdateFeeLateRuleInput = z.infer<typeof updateFeeLateRuleSchema>;
export type WaiveStudentFineInput = z.infer<typeof waiveStudentFineSchema>;
export type ListFeeLateRulesInput = z.infer<typeof listFeeLateRulesSchema>;

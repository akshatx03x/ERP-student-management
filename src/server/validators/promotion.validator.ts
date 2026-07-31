import { EnrollmentStatus } from "@prisma/client";
import { z } from "zod";
import { idSchema } from "./common";

export const classMappingSchema = z.object({
  fromClassId: idSchema,
  fromSectionId: idSchema,
  toClassId: idSchema,
  toSectionId: idSchema,
});

export const getPromotionPreviewSchema = z.object({
  fromSessionId: idSchema,
  toSessionId: idSchema,
  classMappings: z.array(classMappingSchema).min(1, "At least one class mapping is required"),
});

export const studentPromotionItemSchema = z.object({
  studentId: idSchema,
  fromClassId: idSchema,
  fromSectionId: idSchema,
  toClassId: idSchema,
  toSectionId: idSchema,
  action: z.enum(["PROMOTE", "RETAIN", "TRANSFER", "WITHDRAW", "GRADUATE"]),
  targetHouse: z.string().trim().optional().nullable(),
});

export const executePromotionSchema = z.object({
  fromSessionId: idSchema,
  toSessionId: idSchema,
  promotions: z.array(studentPromotionItemSchema).min(1, "At least one student promotion decision is required"),
});

export const undoPromotionSchema = z.object({
  promotionBatchId: idSchema,
});

export type GetPromotionPreviewInput = z.infer<typeof getPromotionPreviewSchema>;
export type StudentPromotionItem = z.infer<typeof studentPromotionItemSchema>;
export type ExecutePromotionInput = z.infer<typeof executePromotionSchema>;
export type UndoPromotionInput = z.infer<typeof undoPromotionSchema>;

import { z } from "zod";
import { idSchema } from "./common";

export const updateBrandingSchema = z.object({
  schoolName: z.string().trim().min(1).optional(),
  address: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal("")),
  principalName: z.string().trim().optional().nullable(),
  logoDocumentId: idSchema.optional().nullable(),
  principalSignatureDocumentId: idSchema.optional().nullable(),
  schoolStampDocumentId: idSchema.optional().nullable(),
  qrCodeDocumentId: idSchema.optional().nullable(),
  receiptFooter: z.string().trim().optional().nullable(),
  reportCardFooter: z.string().trim().optional().nullable(),
});

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

import { DocumentOwnerType, DocumentType } from "@prisma/client";
import { z } from "zod";
import { idSchema } from "./common";

export const uploadDocumentSchema = z.object({
  ownerType: z.nativeEnum(DocumentOwnerType),
  ownerId: idSchema,
  type: z.nativeEnum(DocumentType).default(DocumentType.OTHER),
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  data: z.instanceof(Buffer).or(z.instanceof(Uint8Array)),
});

export const getDocumentSchema = z.object({ id: idSchema });

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

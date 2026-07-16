import { ImportType } from "@prisma/client";
import { z } from "zod";
import { idSchema } from "./common";

export const importPreviewSchema = z.object({
  type: z.nativeEnum(ImportType),
  data: z.instanceof(Buffer).or(z.instanceof(Uint8Array)),
});

export const importExecuteSchema = z.object({
  jobId: idSchema,
});

export const importTemplateSchema = z.object({
  type: z.nativeEnum(ImportType),
});

export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;
export type ImportExecuteInput = z.infer<typeof importExecuteSchema>;

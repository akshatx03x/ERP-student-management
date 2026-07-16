"use server";

import { ImportType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  downloadImportTemplate,
  executeImport,
  previewImport,
} from "@/server/services/import.service";

export async function getImportTemplateAction(type: ImportType) {
  const buffer = await downloadImportTemplate(type);
  return buffer.toString("base64");
}

export async function previewImportAction(type: ImportType, base64: string) {
  const data = Buffer.from(base64, "base64");
  return previewImport(type, data);
}

export async function executeImportAction(jobId: string) {
  const result = await executeImport(jobId);
  revalidatePath("/families");
  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/settings");
  return result;
}

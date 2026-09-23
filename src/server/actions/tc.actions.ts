"use server";

import { revalidatePath } from "next/cache";
import {
  listTransferCertificates,
  createTransferCertificateDraft,
  updateTransferCertificateDraft,
  executeTCStatusAction,
  getTransferCertificateDetail,
  suggestNextTCNumber,
} from "@/server/services/tc.service";
import type {
  ListTCsInput,
  GenerateTCInput,
  UpdateTCInput,
  TCStatusActionInput,
} from "@/server/validators/tc.validator";

import { safeAction } from "@/server/lib/action-response";

export async function listTCsAction(input?: ListTCsInput) {
  return listTransferCertificates(input);
}

export async function generateTCAction(input: GenerateTCInput) {
  return safeAction("generateTCAction", async () => {
    const result = await createTransferCertificateDraft(input);
    revalidatePath("/students/tc");
    return result;
  }, "Failed to generate TC draft");
}

export async function updateTCAction(input: UpdateTCInput) {
  return safeAction("updateTCAction", async () => {
    const result = await updateTransferCertificateDraft(input);
    revalidatePath("/students/tc");
    return result;
  }, "Failed to save TC changes");
}

export async function executeTCStatusActionAction(input: TCStatusActionInput) {
  return safeAction("executeTCStatusActionAction", async () => {
    const result = await executeTCStatusAction(input);
    revalidatePath("/students/tc");
    return result;
  }, "Failed to update TC status");
}

export async function getTCDetailAction(tcId: string) {
  return getTransferCertificateDetail(tcId);
}

export async function suggestNextTCNumberAction() {
  return suggestNextTCNumber();
}

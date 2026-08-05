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

export async function listTCsAction(input?: ListTCsInput) {
  return listTransferCertificates(input);
}

export async function generateTCAction(input: GenerateTCInput) {
  const result = await createTransferCertificateDraft(input);
  revalidatePath("/students/tc");
  return result;
}

export async function updateTCAction(input: UpdateTCInput) {
  const result = await updateTransferCertificateDraft(input);
  revalidatePath("/students/tc");
  return result;
}

export async function executeTCStatusActionAction(input: TCStatusActionInput) {
  const result = await executeTCStatusAction(input);
  revalidatePath("/students/tc");
  return result;
}

export async function getTCDetailAction(tcId: string) {
  return getTransferCertificateDetail(tcId);
}

export async function suggestNextTCNumberAction() {
  return suggestNextTCNumber();
}

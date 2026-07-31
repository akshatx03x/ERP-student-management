"use server";

import { revalidatePath } from "next/cache";
import {
  listFeeHeads,
  createFeeHead,
  updateFeeHead,
  listStudentFees,
  listPayments,
  recordFamilyPayment,
  getPaymentReceipt,
  createFeeStructure,
  updateFeeStructure,
  listFeeStructures,
  getStudentFeeLedger,
  getStudentPortalFees,
  getFamilyFeeDues,
  generateStudentMonthlyLedger,
} from "@/server/services/fee.service";
import type {
  CreateFeeHeadInput,
  CreateFeeStructureInput,
  GenerateMonthlyLedgerInput,
  RecordPaymentInput,
  UpdateFeeStructureInput,
} from "@/server/validators/fee.validator";

export async function listFeeHeadsAction(activeOnly = false) {
  return listFeeHeads(activeOnly);
}

export async function createFeeHeadAction(input: CreateFeeHeadInput) {
  const r = await createFeeHead(input);
  revalidatePath("/fees");
  revalidatePath("/fees/fee-heads");
  return r;
}

export async function updateFeeHeadAction(input: { id: string; name?: string; description?: string | null; isActive?: boolean }) {
  const r = await updateFeeHead(input);
  revalidatePath("/fees");
  revalidatePath("/fees/fee-heads");
  return r;
}

export async function listStudentFeesAction(input?: Parameters<typeof listStudentFees>[0]) {
  return listStudentFees(input);
}

export async function listPaymentsAction(input?: Parameters<typeof listPayments>[0]) {
  return listPayments(input);
}

export async function recordPaymentAction(input: RecordPaymentInput) {
  const r = await recordFamilyPayment(input);
  revalidatePath("/fees");
  revalidatePath("/families");
  revalidatePath(`/families/${input.familyId}`);
  revalidatePath("/students");
  return { success: true, paymentId: r.payment.id };
}

export async function getReceiptAction(paymentId: string) {
  return getPaymentReceipt(paymentId);
}

export async function createFeeStructureAction(input: CreateFeeStructureInput) {
  const r = await createFeeStructure(input);
  revalidatePath("/fees");
  return { success: true, id: r.id };
}

export async function updateFeeStructureAction(input: UpdateFeeStructureInput) {
  const r = await updateFeeStructure(input);
  revalidatePath("/fees");
  return { success: true, id: r.structure.id, stats: r.stats };
}

export async function listFeeStructuresAction(sessionId?: string, classId?: string) {
  return listFeeStructures(sessionId, classId);
}

export async function getStudentFeeLedgerAction(studentId: string) {
  return getStudentFeeLedger(studentId);
}

export async function getStudentPortalFeesAction() {
  return getStudentPortalFees();
}

export async function getFamilyFeeDuesAction(familyId: string) {
  return getFamilyFeeDues(familyId);
}

export async function generateStudentMonthlyLedgerAction(input: GenerateMonthlyLedgerInput) {
  const r = await generateStudentMonthlyLedger(input);
  revalidatePath("/fees");
  revalidatePath("/students");
  return { success: true, generated: r.generated };
}

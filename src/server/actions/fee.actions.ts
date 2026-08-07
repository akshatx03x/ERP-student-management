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
  checkFeeStructureRevisionImpact,
  applyFeeStructureRevision,
} from "@/server/services/fee.service";
import type {
  CreateFeeHeadInput,
  CreateFeeStructureInput,
  GenerateMonthlyLedgerInput,
  RecordPaymentInput,
  UpdateFeeStructureInput,
  ApplyFeeRevisionInput,
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

/**
 * Read-only preview: returns breakdown of how many StudentFee records exist
 * for the class+session, categorised by payment state.
 * Called BEFORE the confirmation dialog to show the administrator the impact.
 */
export async function checkFeeStructureRevisionImpactAction(structureId: string) {
  return checkFeeStructureRevisionImpact({ structureId });
}

/**
 * Applies a fee structure revision with the admin-chosen mode.
 * - FUTURE_ONLY: Updates only the fee structure template. No existing StudentFee rows touched.
 * - UPDATE_UNPAID: Updates the template AND updates only completely unpaid StudentFee rows.
 *   Paid and partially paid records are NEVER modified.
 *
 * Runs inside a single database transaction. On failure, everything is rolled back.
 */
export async function applyFeeStructureRevisionAction(input: ApplyFeeRevisionInput) {
  const r = await applyFeeStructureRevision(input);
  revalidatePath("/fees");
  revalidatePath("/fees/setup");
  revalidatePath("/students");
  return {
    success: true,
    revisionMode: r.revisionMode,
    stats: r.stats,
  };
}

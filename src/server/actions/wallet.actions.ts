"use server";

import { revalidatePath } from "next/cache";
import {
  getFamilyWallet,
  getFamilyWalletBalance,
  listAdvanceTransactions,
  manualWalletAdjustment,
  reconcileFamilyAdvance,
  recordWalletTransaction,
  refundFamilyAdvance,
} from "@/server/services/wallet.service";
import type {
  ListWalletTransactionsInput,
  ManualAdjustmentInput,
  RecordWalletTransactionInput,
  RefundWalletInput,
} from "@/server/validators/wallet.validator";

export async function getFamilyWalletAction(familyId: string) {
  return getFamilyWallet(familyId);
}

export async function getFamilyWalletBalanceAction(familyId: string) {
  return getFamilyWalletBalance(familyId);
}

export async function listAdvanceTransactionsAction(input: ListWalletTransactionsInput) {
  return listAdvanceTransactions(input);
}

export async function recordWalletTransactionAction(input: RecordWalletTransactionInput) {
  const r = await recordWalletTransaction(input);
  revalidatePath("/fees");
  revalidatePath("/families");
  revalidatePath(`/families/${input.familyId}`);
  return { success: true, transactionId: r.transaction.id, newBalance: r.wallet.balance };
}

export async function reconcileFamilyAdvanceAction(familyId: string) {
  const res = await reconcileFamilyAdvance(familyId);
  revalidatePath("/fees");
  revalidatePath("/families");
  revalidatePath(`/families/${familyId}`);
  return { success: true, settledCount: res.settledCount, amountSettled: res.amountSettled };
}

export async function refundFamilyAdvanceAction(input: RefundWalletInput) {
  const res = await refundFamilyAdvance(input);
  revalidatePath("/fees");
  revalidatePath("/families");
  revalidatePath(`/families/${input.familyId}`);
  return { success: true, transactionId: res.transaction.id, newBalance: res.wallet.balance };
}

export async function manualWalletAdjustmentAction(input: ManualAdjustmentInput) {
  const res = await manualWalletAdjustment(input);
  revalidatePath("/fees");
  revalidatePath("/families");
  revalidatePath(`/families/${input.familyId}`);
  return { success: true, transactionId: res.transaction.id, newBalance: res.wallet.balance };
}

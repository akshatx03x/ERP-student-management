"use server";

import {
  getCollectionReport,
  getOutstandingAgeingReport,
  getDiscountFineReports,
  getWalletReport,
  generateCashierDailyClosing,
  runFinancialReconciliation,
  runDataIntegrityAudit,
  getPrincipalFinancialDashboard,
  searchFinancialRecords,
  CollectionReportFilter,
  getPrincipalFinanceDashboardDynamic,
  getClasswisePendingList,
  FinanceDashboardFilters,
  ClasswisePendingListFilters,
  getClassWiseFeeStatusReport,
  ClassWiseFeeStatusFilters,
  // New hub report functions
  getReceiptRegister,
  getCashBook,
  getDiscountRegister,
  getRefundRegister,
  getWalletRegister,
  getWalletDetail,
  ReceiptRegisterFilters,
  CashBookFilters,
  DiscountRegisterFilters,
  RefundRegisterFilters,
  WalletRegisterFilters,
} from "@/server/services/financial-reports.service";
import {
  addCashBookEntry,
  voidCashBookEntry,
  listCashBookEntries,
  AddCashBookEntryInput,
  VoidCashBookEntryInput,
  ListCashBookEntriesInput,
} from "@/server/services/cash-book.service";

// ── Existing actions (unchanged) ──────────────────────────────────────────────

export async function getCollectionReportAction(filters?: CollectionReportFilter) {
  return getCollectionReport(filters);
}

export async function getOutstandingAgeingReportAction(sessionId?: string) {
  return getOutstandingAgeingReport(sessionId);
}

export async function getDiscountFineReportsAction(sessionId?: string) {
  return getDiscountFineReports(sessionId);
}

export async function getWalletReportAction() {
  return getWalletReport();
}

export async function generateCashierDailyClosingAction(dateInput?: Date, collectorUserId?: string) {
  return generateCashierDailyClosing(dateInput, collectorUserId);
}

export async function runFinancialReconciliationAction() {
  return runFinancialReconciliation();
}

export async function runDataIntegrityAuditAction() {
  return runDataIntegrityAudit();
}

export async function getPrincipalFinancialDashboardAction() {
  return getPrincipalFinancialDashboard();
}

export async function searchFinancialRecordsAction(query: string) {
  return searchFinancialRecords(query);
}

export async function getPrincipalFinanceDashboardDynamicAction(filters: FinanceDashboardFilters) {
  return getPrincipalFinanceDashboardDynamic(filters);
}

export async function getClasswisePendingListAction(filters: ClasswisePendingListFilters) {
  return getClasswisePendingList(filters);
}

export async function getClassWiseFeeStatusReportAction(filters: ClassWiseFeeStatusFilters) {
  return getClassWiseFeeStatusReport(filters);
}

// ── Finance Reports Hub actions ───────────────────────────────────────────────

export async function getReceiptRegisterAction(filters?: ReceiptRegisterFilters) {
  return getReceiptRegister(filters);
}

export async function getCashBookAction(filters?: CashBookFilters) {
  return getCashBook(filters);
}

export async function getDiscountRegisterAction(filters?: DiscountRegisterFilters) {
  return getDiscountRegister(filters);
}

export async function getRefundRegisterAction(filters?: RefundRegisterFilters) {
  return getRefundRegister(filters);
}

export async function getWalletRegisterAction(filters?: WalletRegisterFilters) {
  return getWalletRegister(filters);
}

export async function getWalletDetailAction(familyId: string) {
  return getWalletDetail(familyId);
}

// ── Cash Book manual entry actions ────────────────────────────────────────────

export async function addCashBookEntryAction(input: AddCashBookEntryInput) {
  return addCashBookEntry(input);
}

export async function voidCashBookEntryAction(input: VoidCashBookEntryInput) {
  return voidCashBookEntry(input);
}

export async function listCashBookEntriesAction(input?: ListCashBookEntriesInput) {
  return listCashBookEntries(input);
}

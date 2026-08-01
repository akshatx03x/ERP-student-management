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
} from "@/server/services/financial-reports.service";

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


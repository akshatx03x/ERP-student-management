import { Prisma, Role, StudentFeeStatus } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { decimalToNumber, parsePagination, schoolIdFromUser, sumDecimals } from "@/server/lib/helpers";

// ── Types & Interfaces ────────────────────────────────────────────────────────
export interface CollectionReportFilter {
  startDate?: Date;
  endDate?: Date;
  sessionId?: string;
  classId?: string;
  sectionId?: string;
  collectorUserId?: string;
  paymentMethod?: string;
  studentFee?: any;
}

export interface AgeingItem {
  studentId: string;
  studentName: string;
  admissionNo: string;
  classSection: string;
  familyId: string;
  fatherName: string;
  bucket0to30: number;
  bucket31to60: number;
  bucket61to90: number;
  bucket90Plus: number;
  totalOutstanding: number;
}

export interface CashierClosingSummary {
  date: Date;
  collectorId: string;
  collectorName: string;
  totalReceiptsCount: number;
  cashAmount: number;
  upiAmount: number;
  chequeAmount: number;
  bankTransferAmount: number;
  walletSettlementAmount: number;
  grossCollected: number;
  refundsAmount: number;
  discountsGrantedAmount: number;
  finesCollectedAmount: number;
  netCollection: number;
}

export interface ReconciliationReport {
  reconciledAt: Date;
  totalReceiptsAmount: number;
  totalAllocationsAmount: number;
  receiptAllocationDiff: number;
  walletSystemBalance: number;
  walletCalculatedCredits: number;
  walletCalculatedDebits: number;
  walletDiscrepancy: number;
  totalFeesCalculated: number;
  totalDiscountsCalculated: number;
  totalFinesCalculated: number;
  totalPaymentsCalculated: number;
  totalOutstandingCalculated: number;
  discrepancies: Array<{
    type: string;
    entityId: string;
    description: string;
    expected: number | string;
    actual: number | string;
  }>;
}

export interface IntegrityAuditReport {
  auditedAt: Date;
  duplicateWalletCredits: number;
  duplicatePayments: number;
  duplicateReceipts: number;
  duplicateActiveDiscounts: number;
  orphanAllocations: number;
  negativeWalletBalances: number;
  statusMismatches: number;
  issues: Array<{
    severity: "HIGH" | "MEDIUM" | "LOW";
    issueType: string;
    entityType: string;
    entityId: string;
    description: string;
    repairSuggestion: string;
  }>;
}

// ── 1. COLLECTION REPORTS SERVICE ─────────────────────────────────────────────
export async function getCollectionReport(
  filters: CollectionReportFilter = {},
  userOverride?: { id: string; role: Role; schoolId?: string | null }
) {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  const whereClause: Prisma.FeePaymentAllocationWhereInput = {
    payment: {
      family: { schoolId },
      ...(filters.startDate || filters.endDate
        ? {
            paidAt: {
              ...(filters.startDate ? { gte: filters.startDate } : {}),
              ...(filters.endDate ? { lte: filters.endDate } : {}),
            },
          }
        : {}),
      ...(filters.collectorUserId ? { recordedByUserId: filters.collectorUserId } : {}),
      ...(filters.paymentMethod ? { method: filters.paymentMethod as any } : {}),
    },
    ...(filters.studentFee
      ? {
          studentFee: {
            ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
            ...(filters.classId || filters.sectionId
              ? {
                  student: {
                    enrollments: {
                      some: {
                        ...(filters.classId ? { classId: filters.classId } : {}),
                        ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
                      },
                    },
                  },
                }
              : {}),
          },
        }
      : {}),
  };

  const allocations = await prisma.feePaymentAllocation.findMany({
    where: whereClause,
    include: {
      payment: {
        include: {
          recordedBy: { select: { id: true, name: true } },
          family: { select: { id: true, fatherName: true, primaryPhone: true } },
        },
      },
      studentFee: {
        include: {
          feeHead: { select: { id: true, name: true } },
          student: {
            include: {
              enrollments: {
                include: { class: true, section: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Aggregations
  let totalCollected = 0;
  const methodBreakdown: Record<string, number> = {};
  const classBreakdown: Record<string, number> = {};
  const collectorBreakdown: Record<string, number> = {};

  const items = allocations.map((alloc) => {
    const amt = decimalToNumber(alloc.amount);
    totalCollected += amt;

    const method = alloc.payment ? (alloc.payment.method as string) : "OTHER";
    methodBreakdown[method] = (methodBreakdown[method] || 0) + amt;

    const collector = alloc.payment?.recordedBy?.name || "System";
    collectorBreakdown[collector] = (collectorBreakdown[collector] || 0) + amt;

    const enrollment = alloc.studentFee?.student?.enrollments[0];
    const classLabel = enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "Unassigned";
    classBreakdown[classLabel] = (classBreakdown[classLabel] || 0) + amt;

    return {
      allocationId: alloc.id,
      paymentId: alloc.paymentId,
      receiptNo: alloc.payment?.receiptNo || "N/A",
      paidAt: alloc.payment?.paidAt || alloc.createdAt,
      method,
      amount: amt,
      studentName: alloc.studentFee?.student?.fullName || "N/A",
      admissionNo: alloc.studentFee?.student?.admissionNo || "N/A",
      classLabel,
      feeHeadName: alloc.studentFee?.feeHead?.name || "Fee",
      collectorName: collector,
      familyFatherName: alloc.payment?.family?.fatherName || "N/A",
    };
  });

  return {
    totalCollected,
    totalRecords: items.length,
    methodBreakdown,
    classBreakdown,
    collectorBreakdown,
    items,
  };
}

// ── 2. OUTSTANDING & AGEING REPORTS ──────────────────────────────────────────
export async function getOutstandingAgeingReport(
  sessionId?: string,
  userOverride?: { id: string; role: Role; schoolId?: string | null }
) {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  const studentFees = await prisma.studentFee.findMany({
    where: {
      student: { schoolId },
      ...(sessionId ? { sessionId } : {}),
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    include: {
      feeHead: { select: { name: true } },
      allocations: { select: { amount: true } },
      fine: { select: { finalAmount: true } },
      student: {
        include: {
          family: { select: { id: true, fatherName: true, primaryPhone: true } },
          enrollments: {
            include: { class: true, section: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  const ageingMap = new Map<string, AgeingItem>();

  let grandTotalOutstanding = 0;
  let totalBucket0to30 = 0;
  let totalBucket31to60 = 0;
  let totalBucket61to90 = 0;
  let totalBucket90Plus = 0;

  for (const fee of studentFees) {
    const orig = decimalToNumber(fee.amount);
    const disc = decimalToNumber(fee.discountAmount);
    const fine = fee.fine ? decimalToNumber(fee.fine.finalAmount) : 0;
    const paid = decimalToNumber(sumDecimals(fee.allocations.map((a) => a.amount)));

    const remaining = Math.max(0, orig - disc + fine - paid);
    if (remaining <= 0) continue;

    grandTotalOutstanding += remaining;

    const dueDate = fee.dueDate || fee.createdAt;
    const diffTime = Math.max(0, now.getTime() - dueDate.getTime());
    const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let b0to30 = 0;
    let b31to60 = 0;
    let b61to90 = 0;
    let b90plus = 0;

    if (daysOverdue <= 30) {
      b0to30 = remaining;
      totalBucket0to30 += remaining;
    } else if (daysOverdue <= 60) {
      b31to60 = remaining;
      totalBucket31to60 += remaining;
    } else if (daysOverdue <= 90) {
      b61to90 = remaining;
      totalBucket61to90 += remaining;
    } else {
      b90plus = remaining;
      totalBucket90Plus += remaining;
    }

    const studentId = fee.student.id;
    const enrollment = fee.student.enrollments[0];
    const classSection = enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "Unassigned";

    if (!ageingMap.has(studentId)) {
      ageingMap.set(studentId, {
        studentId,
        studentName: fee.student.fullName,
        admissionNo: fee.student.admissionNo,
        classSection,
        familyId: fee.student.family.id,
        fatherName: fee.student.family.fatherName || "N/A",
        bucket0to30: b0to30,
        bucket31to60: b31to60,
        bucket61to90: b61to90,
        bucket90Plus: b90plus,
        totalOutstanding: remaining,
      });
    } else {
      const item = ageingMap.get(studentId)!;
      item.bucket0to30 += b0to30;
      item.bucket31to60 += b31to60;
      item.bucket61to90 += b61to90;
      item.bucket90Plus += b90plus;
      item.totalOutstanding += remaining;
    }
  }

  const items = Array.from(ageingMap.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  return {
    grandTotalOutstanding,
    summary: {
      bucket0to30: totalBucket0to30,
      bucket31to60: totalBucket31to60,
      bucket61to90: totalBucket61to90,
      bucket90Plus: totalBucket90Plus,
    },
    totalStudents: items.length,
    items,
  };
}

// ── 3. DISCOUNT & FINE REPORTS ───────────────────────────────────────────────
export async function getDiscountFineReports(
  sessionId?: string,
  userOverride?: { id: string; role: Role; schoolId?: string | null }
) {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  const [discounts, fines] = await Promise.all([
    prisma.feeDiscount.findMany({
      where: {
        student: { schoolId },
        ...(sessionId ? { sessionId } : {}),
      },
      include: {
        feeHead: { select: { name: true } },
        approvedBy: { select: { name: true } },
        student: { select: { fullName: true, admissionNo: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.studentFeeFine.findMany({
      where: {
        studentFee: { student: { schoolId }, ...(sessionId ? { sessionId } : {}) },
      },
      include: {
        lateRule: { select: { name: true, calculationType: true } },
        waivedBy: { select: { name: true } },
        studentFee: {
          include: {
            feeHead: { select: { name: true } },
            student: { select: { fullName: true, admissionNo: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  let totalDiscountGranted = 0;
  const categoryBreakdown: Record<string, number> = {};

  const discountItems = discounts.map((d) => {
    const val = decimalToNumber(d.value);
    totalDiscountGranted += val;
    categoryBreakdown[d.category] = (categoryBreakdown[d.category] || 0) + val;

    return {
      id: d.id,
      category: d.category,
      discountType: d.discountType,
      value: val,
      studentName: d.student?.fullName || "N/A",
      admissionNo: d.student?.admissionNo || "N/A",
      feeHeadName: d.feeHead ? d.feeHead.name : "All Fee Heads",
      reason: d.reason,
      approvedBy: d.approvedBy ? d.approvedBy.name : "System",
      status: d.status,
      createdAt: d.createdAt,
    };
  });

  let totalFineGenerated = 0;
  let totalFineWaived = 0;
  let totalFineFinal = 0;
  let totalFinePaid = 0;

  const fineItems = fines.map((f) => {
    const calc = decimalToNumber(f.calculatedAmount);
    const waived = decimalToNumber(f.waivedAmount);
    const final = decimalToNumber(f.finalAmount);
    const paid = decimalToNumber(f.paidAmount);

    totalFineGenerated += calc;
    totalFineWaived += waived;
    totalFineFinal += final;
    totalFinePaid += paid;

    return {
      id: f.id,
      studentName: f.studentFee.student.fullName,
      admissionNo: f.studentFee.student.admissionNo,
      feeHeadName: f.studentFee.feeHead.name,
      ruleName: f.lateRule ? f.lateRule.name : "System Rule",
      calculatedAmount: calc,
      waivedAmount: waived,
      finalAmount: final,
      paidAmount: paid,
      status: f.status,
      waivedBy: f.waivedBy ? f.waivedBy.name : null,
      waiveReason: f.waiveReason,
    };
  });

  return {
    discounts: {
      totalGranted: totalDiscountGranted,
      categoryBreakdown,
      items: discountItems,
    },
    fines: {
      totalGenerated: totalFineGenerated,
      totalWaived: totalFineWaived,
      totalFinal: totalFineFinal,
      totalPaid: totalFinePaid,
      totalOutstanding: Math.max(0, totalFineFinal - totalFinePaid),
      items: fineItems,
    },
  };
}

// ── 4. WALLET REPORTS ─────────────────────────────────────────────────────────
export async function getWalletReport(
  userOverride?: { id: string; role: Role; schoolId?: string | null }
) {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  const [wallets, transactions] = await Promise.all([
    prisma.familyAdvanceWallet.findMany({
      where: { family: { schoolId } },
      include: {
        family: { select: { fatherName: true, primaryPhone: true } },
      },
    }),
    prisma.advanceTransaction.findMany({
      where: { family: { schoolId } },
      include: {
        family: { select: { fatherName: true } },
        targetStudent: { select: { fullName: true } },
        recordedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  let totalWalletSystemBalance = 0;
  wallets.forEach((w) => {
    totalWalletSystemBalance += decimalToNumber(w.balance);
  });

  let totalCredits = 0;
  let totalDebits = 0;

  const transactionItems = transactions.map((tx) => {
    const amt = decimalToNumber(tx.amount);
    if (tx.type.includes("CREDIT")) totalCredits += amt;
    else totalDebits += amt;

    return {
      id: tx.id,
      createdAt: tx.createdAt,
      familyFatherName: tx.family.fatherName,
      targetStudent: tx.targetStudent ? tx.targetStudent.fullName : "N/A",
      type: tx.type,
      amount: amt,
      balanceBefore: decimalToNumber(tx.balanceBefore),
      balanceAfter: decimalToNumber(tx.balanceAfter),
      reason: tx.reason,
      recordedBy: tx.recordedBy ? tx.recordedBy.name : "System",
    };
  });

  return {
    totalWalletSystemBalance,
    totalCredits,
    totalDebits,
    totalWallets: wallets.length,
    transactions: transactionItems,
  };
}

// ── 5. CASHIER CLOSING SYSTEM ────────────────────────────────────────────────
export async function generateCashierDailyClosing(
  dateInput?: Date,
  collectorUserId?: string,
  userOverride?: { id: string; role: Role; schoolId?: string | null }
): Promise<CashierClosingSummary> {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  const targetDate = dateInput || new Date();
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
  const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

  const payments = await prisma.familyPayment.findMany({
    where: {
      family: { schoolId },
      paidAt: { gte: startOfDay, lte: endOfDay },
      ...(collectorUserId ? { recordedByUserId: collectorUserId } : {}),
    },
    include: {
      recordedBy: { select: { id: true, name: true } },
      allocations: {
        include: {
          studentFee: { select: { discountAmount: true } },
          studentFeeFine: { select: { finalAmount: true } },
        },
      },
    },
  });

  let cash = 0;
  let upi = 0;
  let cheque = 0;
  let bank = 0;
  let wallet = 0;
  let gross = 0;
  let finesCollected = 0;
  let discountsGranted = 0;

  for (const p of payments) {
    const amt = decimalToNumber(p.amount);
    gross += amt;

    switch (p.method as string) {
      case "CASH":
        cash += amt;
        break;
      case "UPI":
        upi += amt;
        break;
      case "CHEQUE":
        cheque += amt;
        break;
      case "BANK_TRANSFER":
        bank += amt;
        break;
      case "WALLET_SETTLEMENT":
        wallet += amt;
        break;
      default:
        cash += amt;
    }

    for (const alloc of p.allocations) {
      if (alloc.studentFeeFine) {
        finesCollected += decimalToNumber(alloc.amount);
      }
      if (alloc.studentFee) {
        discountsGranted += decimalToNumber(alloc.studentFee.discountAmount);
      }
    }
  }

  // Check manual refunds on date
  const refundTx = await prisma.advanceTransaction.aggregate({
    where: {
      family: { schoolId },
      type: "MANUAL_REFUND",
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
    _sum: { amount: true },
  });
  const refundsAmount = decimalToNumber(refundTx._sum.amount ?? 0);

  const collectorName = payments[0]?.recordedBy?.name || (collectorUserId ? "Collector" : "All Cashiers");

  return {
    date: startOfDay,
    collectorId: collectorUserId || "ALL",
    collectorName,
    totalReceiptsCount: payments.length,
    cashAmount: cash,
    upiAmount: upi,
    chequeAmount: cheque,
    bankTransferAmount: bank,
    walletSettlementAmount: wallet,
    grossCollected: gross,
    refundsAmount,
    discountsGrantedAmount: discountsGranted,
    finesCollectedAmount: finesCollected,
    netCollection: Math.max(0, gross - refundsAmount),
  };
}

// ── 6. FINANCIAL RECONCILIATION ENGINE ───────────────────────────────────────
export async function runFinancialReconciliation(
  userOverride?: { id: string; role: Role; schoolId?: string | null }
): Promise<ReconciliationReport> {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  const [payments, allocations, wallets, transactions, studentFees] = await Promise.all([
    prisma.familyPayment.aggregate({
      where: { family: { schoolId } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.feePaymentAllocation.aggregate({
      where: { payment: { family: { schoolId } } },
      _sum: { amount: true },
    }),
    prisma.familyAdvanceWallet.aggregate({
      where: { family: { schoolId } },
      _sum: { balance: true },
    }),
    prisma.advanceTransaction.findMany({
      where: { family: { schoolId } },
      select: { type: true, amount: true },
    }),
    prisma.studentFee.findMany({
      where: { student: { schoolId } },
      select: { id: true, amount: true, discountAmount: true, status: true, allocations: { select: { amount: true } } },
    }),
  ]);

  const totalReceiptsAmount = decimalToNumber(payments._sum.amount ?? 0);
  const totalAllocationsAmount = decimalToNumber(allocations._sum.amount ?? 0);
  const walletSystemBalance = decimalToNumber(wallets._sum.balance ?? 0);

  let walletCalculatedCredits = 0;
  let walletCalculatedDebits = 0;
  let totalWalletPaymentCredits = 0;

  transactions.forEach((tx) => {
    const amt = decimalToNumber(tx.amount);
    if (tx.type.includes("CREDIT")) {
      walletCalculatedCredits += amt;
      if (tx.type === "CREDIT_FROM_PAYMENT") totalWalletPaymentCredits += amt;
    } else {
      walletCalculatedDebits += amt;
    }
  });

  const totalAccountedReceipts = totalAllocationsAmount + totalWalletPaymentCredits;
  const receiptAllocationDiff = Math.abs(totalReceiptsAmount - totalAccountedReceipts);

  const calculatedWalletNet = Math.max(0, walletCalculatedCredits - walletCalculatedDebits);
  const walletDiscrepancy = Math.abs(walletSystemBalance - calculatedWalletNet);

  let totalFeesCalculated = 0;
  let totalDiscountsCalculated = 0;
  let totalPaymentsCalculated = 0;

  studentFees.forEach((sf) => {
    totalFeesCalculated += decimalToNumber(sf.amount);
    totalDiscountsCalculated += decimalToNumber(sf.discountAmount);
    totalPaymentsCalculated += decimalToNumber(sumDecimals(sf.allocations.map((a) => a.amount)));
  });

  const discrepancies: Array<{
    type: string;
    entityId: string;
    description: string;
    expected: number | string;
    actual: number | string;
  }> = [];

  if (receiptAllocationDiff > 0.01) {
    discrepancies.push({
      type: "RECEIPT_ALLOCATION_MISMATCH",
      entityId: "GLOBAL_PAYMENTS",
      description: "Total payment receipt amount does not equal sum of allocations plus wallet payment credits",
      expected: totalReceiptsAmount,
      actual: totalAccountedReceipts,
    });
  }

  if (walletDiscrepancy > 0.01) {
    discrepancies.push({
      type: "WALLET_LEDGER_MISMATCH",
      entityId: "GLOBAL_WALLETS",
      description: "Sum of wallet balances does not equal total credits minus debits",
      expected: calculatedWalletNet,
      actual: walletSystemBalance,
    });
  }

  return {
    reconciledAt: new Date(),
    totalReceiptsAmount,
    totalAllocationsAmount,
    receiptAllocationDiff,
    walletSystemBalance,
    walletCalculatedCredits,
    walletCalculatedDebits,
    walletDiscrepancy,
    totalFeesCalculated,
    totalDiscountsCalculated,
    totalFinesCalculated: 0,
    totalPaymentsCalculated,
    totalOutstandingCalculated: Math.max(0, totalFeesCalculated - totalDiscountsCalculated - totalPaymentsCalculated),
    discrepancies,
  };
}

// ── 7. DATA INTEGRITY AUDIT ───────────────────────────────────────────────────
export async function runDataIntegrityAudit(
  userOverride?: { id: string; role: Role; schoolId?: string | null }
): Promise<IntegrityAuditReport> {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  const issues: IntegrityAuditReport["issues"] = [];

  // Check 1: Negative Wallet Balances
  const negativeWallets = await prisma.familyAdvanceWallet.findMany({
    where: { family: { schoolId }, balance: { lt: 0 } },
    select: { id: true, familyId: true, balance: true },
  });

  negativeWallets.forEach((w) => {
    issues.push({
      severity: "HIGH",
      issueType: "NEGATIVE_WALLET_BALANCE",
      entityType: "FamilyAdvanceWallet",
      entityId: w.id,
      description: `Family wallet has negative balance (${w.balance})`,
      repairSuggestion: `Review advance transactions for family ${w.familyId} and credit missing amount or log correction transaction`,
    });
  });

  // Check 2: Orphan Allocations (Allocations without StudentFee or Fine)
  const orphanAllocations = await prisma.feePaymentAllocation.findMany({
    where: {
      payment: { family: { schoolId } },
      studentFeeId: null,
      studentFeeFineId: null,
    },
    select: { id: true, paymentId: true, amount: true },
  });

  orphanAllocations.forEach((a) => {
    issues.push({
      severity: "HIGH",
      issueType: "ORPHAN_PAYMENT_ALLOCATION",
      entityType: "FeePaymentAllocation",
      entityId: a.id,
      description: `Allocation ${a.id} of ₹${a.amount} is not linked to any StudentFee or StudentFeeFine`,
      repairSuggestion: `Re-associate allocation to target student fee or adjust payment header allocation`,
    });
  });

  // Check 3: StudentFee Status Mismatches (Paid amount >= Net Due but status != PAID)
  const statusMismatches = await prisma.studentFee.findMany({
    where: {
      student: { schoolId },
      status: { not: "PAID" },
    },
    include: {
      allocations: { select: { amount: true } },
      fine: { select: { finalAmount: true } },
    },
  });

  statusMismatches.forEach((sf) => {
    const orig = decimalToNumber(sf.amount);
    const disc = decimalToNumber(sf.discountAmount);
    const fine = sf.fine ? decimalToNumber(sf.fine.finalAmount) : 0;
    const paid = decimalToNumber(sumDecimals(sf.allocations.map((a) => a.amount)));
    const netDue = Math.max(0, orig - disc + fine);

    if (paid >= netDue && netDue > 0) {
      issues.push({
        severity: "MEDIUM",
        issueType: "STATUS_MISMATCH_SHOULD_BE_PAID",
        entityType: "StudentFee",
        entityId: sf.id,
        description: `StudentFee status is '${sf.status}' but paid amount (₹${paid}) >= net due (₹${netDue})`,
        repairSuggestion: `Run recalcStudentFeeStatus('${sf.id}') to sync status to PAID`,
      });
    }
  });

  return {
    auditedAt: new Date(),
    duplicateWalletCredits: 0,
    duplicatePayments: 0,
    duplicateReceipts: 0,
    duplicateActiveDiscounts: 0,
    orphanAllocations: orphanAllocations.length,
    negativeWalletBalances: negativeWallets.length,
    statusMismatches: issues.filter((i) => i.issueType.includes("STATUS")).length,
    issues,
  };
}

// ── 8. PRINCIPAL EXECUTIVE FINANCIAL DASHBOARD ────────────────────────────────
export async function getPrincipalFinancialDashboard(
  userOverride?: { id: string; role: Role; schoolId?: string | null }
) {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);

  const [
    todayPayments,
    totalOutstanding,
    walletBalance,
    totalDiscounts,
    totalFines,
    topDefaulters,
  ] = await Promise.all([
    prisma.familyPayment.aggregate({
      where: { family: { schoolId }, paidAt: { gte: startOfDay } },
      _sum: { amount: true },
      _count: true,
    }),
    getOutstandingAgeingReport(undefined, user),
    getWalletReport(user),
    prisma.feeDiscount.aggregate({
      where: { student: { schoolId }, status: "ACTIVE" },
      _sum: { value: true },
    }),
    prisma.studentFeeFine.aggregate({
      where: { studentFee: { student: { schoolId } }, status: "ACTIVE" },
      _sum: { finalAmount: true },
    }),
    prisma.studentFee.groupBy({
      by: ["studentId"],
      where: { student: { schoolId }, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    }),
  ]);

  const defaulterStudentIds = topDefaulters.map((d) => d.studentId);
  const defaulterStudents = await prisma.student.findMany({
    where: { id: { in: defaulterStudentIds } },
    select: { id: true, fullName: true, admissionNo: true, family: { select: { fatherName: true, primaryPhone: true } } },
  });

  const defaultersList = topDefaulters.map((d) => {
    const st = defaulterStudents.find((s) => s.id === d.studentId);
    return {
      studentId: d.studentId,
      studentName: st ? st.fullName : "Unknown",
      admissionNo: st ? st.admissionNo : "N/A",
      fatherName: st ? st.family.fatherName : "N/A",
      phone: st ? st.family.primaryPhone : "N/A",
      totalOverdue: decimalToNumber(d._sum.amount ?? 0),
    };
  });

  return {
    todayCollection: decimalToNumber(todayPayments._sum.amount ?? 0),
    todayPaymentsCount: todayPayments._count,
    totalOutstanding: totalOutstanding.grandTotalOutstanding,
    walletBalance: walletBalance.totalWalletSystemBalance,
    totalDiscounts: decimalToNumber(totalDiscounts._sum.value ?? 0),
    totalFines: decimalToNumber(totalFines._sum.finalAmount ?? 0),
    ageingSummary: totalOutstanding.summary,
    topDefaulters: defaultersList,
  };
}

// ── 9. GLOBAL FINANCIAL SEARCH ────────────────────────────────────────────────
export async function searchFinancialRecords(
  query: string,
  userOverride?: { id: string; role: Role; schoolId?: string | null }
) {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  if (!query || query.trim().length < 2) return { students: [], receipts: [], families: [] };

  const q = query.trim();

  const [students, receipts, families] = await Promise.all([
    prisma.student.findMany({
      where: {
        schoolId,
        OR: [
          { fullName: { contains: q } },
          { admissionNo: { contains: q } },
        ],
      },
      select: { id: true, fullName: true, admissionNo: true, status: true },
      take: 10,
    }),
    prisma.familyPayment.findMany({
      where: {
        family: { schoolId },
        OR: [
          { receiptNo: { contains: q } },
          { referenceNo: { contains: q } },
        ],
      },
      select: { id: true, receiptNo: true, amount: true, paidAt: true, method: true },
      take: 10,
    }),
    prisma.family.findMany({
      where: {
        schoolId,
        OR: [
          { fatherName: { contains: q } },
          { motherName: { contains: q } },
          { primaryPhone: { contains: q } },
        ],
      },
      select: { id: true, fatherName: true, primaryPhone: true },
      take: 10,
    }),
  ]);

  return {
    students,
    receipts: receipts.map((r) => ({ ...r, amount: decimalToNumber(r.amount) })),
    families,
  };
}

export interface FinanceDashboardFilters {
  sessionId?: string;
  month?: string;
  startDate?: Date;
  endDate?: Date;
  classId?: string;
  sectionId?: string;
}

export async function getPrincipalFinanceDashboardDynamic(filters: FinanceDashboardFilters) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  // 1. Fetch academic sessions, classes & sections for filters dropdowns
  const [sessions, classes] = await Promise.all([
    prisma.academicSession.findMany({
      where: { schoolId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, isCurrent: true },
    }),
    prisma.class.findMany({
      where: { schoolId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        sections: {
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
    }),
  ]);

  const activeSessionId = filters.sessionId || sessions.find(s => s.isCurrent)?.id || sessions[0]?.id;

  // 2. Fetch student fees matching filters
  const dateClause: Prisma.StudentFeeWhereInput["dueDate"] = {};
  if (filters.startDate) dateClause.gte = filters.startDate;
  if (filters.endDate) dateClause.lte = filters.endDate;

  const whereClause: Prisma.StudentFeeWhereInput = {
    student: {
      schoolId,
      status: "ACTIVE", // only query active students
      ...(filters.classId || filters.sectionId || activeSessionId
        ? {
            enrollments: {
              some: {
                ...(activeSessionId ? { sessionId: activeSessionId } : {}),
                ...(filters.classId ? { classId: filters.classId } : {}),
                ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
              },
            },
          }
        : {}),
    },
    ...(activeSessionId ? { sessionId: activeSessionId } : {}),
    ...(filters.month ? { month: filters.month as any } : {}),
    ...(Object.keys(dateClause).length > 0 ? { dueDate: dateClause } : {}),
  };

  const studentFees = await prisma.studentFee.findMany({
    where: whereClause,
    select: {
      id: true,
      amount: true,
      discountAmount: true,
      month: true,
      dueDate: true,
      status: true,
      allocations: { select: { amount: true, createdAt: true } },
      fine: { select: { finalAmount: true } },
      student: {
        select: {
          id: true,
          fullName: true,
          enrollments: {
            where: { sessionId: activeSessionId },
            select: { classId: true, sectionId: true },
            take: 1,
          },
        },
      },
    },
  });

  // Today's boundaries for "Today's Collection" calculation
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  // This Month's boundaries for "This Month's Collection"
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  // 3. Process aggregates
  let totalExpected = 0;
  let totalCollected = 0;
  let totalPending = 0;
  let todayCollection = 0;
  let monthCollection = 0;

  // Student specific aggregation map
  const studentTotals = new Map<string, { expected: number; paid: number; remaining: number }>();

  // Class and Section level aggregations
  const classStats = new Map<string, { expected: number; paid: number; remaining: number; students: Set<string>; paidCount: Set<string>; partialCount: Set<string>; unpaidCount: Set<string> }>();
  const sectionStats = new Map<string, { expected: number; paid: number; remaining: number; students: Set<string>; paidCount: Set<string>; partialCount: Set<string>; unpaidCount: Set<string> }>();

  // Initialize maps for all classes and sections to ensure they are visible even with 0 fees
  classes.forEach(c => {
    classStats.set(c.id, { expected: 0, paid: 0, remaining: 0, students: new Set(), paidCount: new Set(), partialCount: new Set(), unpaidCount: new Set() });
    c.sections.forEach(s => {
      sectionStats.set(s.id, { expected: 0, paid: 0, remaining: 0, students: new Set(), paidCount: new Set(), partialCount: new Set(), unpaidCount: new Set() });
    });
  });

  // Monthly Trend Map (April to March)
  const monthlyCollections: Record<string, number> = {};

  studentFees.forEach(fee => {
    const orig = decimalToNumber(fee.amount);
    const disc = decimalToNumber(fee.discountAmount);
    const fine = fee.fine ? decimalToNumber(fee.fine.finalAmount) : 0;
    const paid = decimalToNumber(sumDecimals(fee.allocations.map(a => a.amount)));

    const netDue = Math.max(0, orig - disc + fine);
    const remaining = Math.max(0, netDue - paid);

    totalExpected += netDue;
    totalCollected += paid;
    totalPending += remaining;

    // Monthly collection trend
    if (fee.month) {
      monthlyCollections[fee.month] = (monthlyCollections[fee.month] || 0) + paid;
    }

    // Today's / Month's collection metrics based on allocation date
    fee.allocations.forEach(alloc => {
      const allocDate = new Date(alloc.createdAt);
      const allocAmt = decimalToNumber(alloc.amount);
      if (allocDate >= startOfToday && allocDate <= endOfToday) {
        todayCollection += allocAmt;
      }
      if (allocDate >= startOfMonth && allocDate <= endOfMonth) {
        monthCollection += allocAmt;
      }
    });

    const sId = fee.student.id;
    const enrollment = fee.student.enrollments[0];
    const cId = enrollment?.classId;
    const sctId = enrollment?.sectionId;

    // Track totals per student
    if (!studentTotals.has(sId)) {
      studentTotals.set(sId, { expected: 0, paid: 0, remaining: 0 });
    }
    const sTot = studentTotals.get(sId)!;
    sTot.expected += netDue;
    sTot.paid += paid;
    sTot.remaining += remaining;

    // Accumulate class statistics
    if (cId && classStats.has(cId)) {
      const cStat = classStats.get(cId)!;
      cStat.expected += netDue;
      cStat.paid += paid;
      cStat.remaining += remaining;
      cStat.students.add(sId);
    }

    // Accumulate section statistics
    if (sctId && sectionStats.has(sctId)) {
      const sStat = sectionStats.get(sctId)!;
      sStat.expected += netDue;
      sStat.paid += paid;
      sStat.remaining += remaining;
      sStat.students.add(sId);
    }
  });

  // 4. Calculate Student status lists (Paid vs Partial vs Unpaid)
  let paidStudentsCount = 0;
  let partialStudentsCount = 0;
  let unpaidStudentsCount = 0;

  studentTotals.forEach((tot, sId) => {
    // Determine status of student
    let status: "PAID" | "PARTIAL" | "UNPAID" = "UNPAID";
    if (tot.paid >= tot.expected && tot.expected > 0) {
      status = "PAID";
      paidStudentsCount++;
    } else if (tot.paid > 0) {
      status = "PARTIAL";
      partialStudentsCount++;
    } else {
      unpaidStudentsCount++;
    }

    // Distribute to class-level counts
    studentFees.forEach(fee => {
      if (fee.student.id === sId) {
        const enrollment = fee.student.enrollments[0];
        const cId = enrollment?.classId;
        const sctId = enrollment?.sectionId;

        if (cId && classStats.has(cId)) {
          const cStat = classStats.get(cId)!;
          if (status === "PAID") cStat.paidCount.add(sId);
          else if (status === "PARTIAL") cStat.partialCount.add(sId);
          else cStat.unpaidCount.add(sId);
        }

        if (sctId && sectionStats.has(sctId)) {
          const sStat = sectionStats.get(sctId)!;
          if (status === "PAID") sStat.paidCount.add(sId);
          else if (status === "PARTIAL") sStat.partialCount.add(sId);
          else sStat.unpaidCount.add(sId);
        }
      }
    });
  });

  // Format Class-wise Collection Summary Table rows
  const summaryRows = classes.map(c => {
    const cStat = classStats.get(c.id)!;
    const sectionsData = c.sections.map(s => {
      const sStat = sectionStats.get(s.id)!;
      const expected = sStat.expected;
      const paid = sStat.paid;
      const remaining = sStat.remaining;
      const totalStudents = sStat.students.size;
      const collectionPercent = expected > 0 ? Math.round((paid / expected) * 100) : 100;

      return {
        sectionId: s.id,
        sectionName: s.name,
        totalStudents,
        expected,
        paid,
        remaining,
        collectionPercent,
        paidCount: sStat.paidCount.size,
        partialCount: sStat.partialCount.size,
        unpaidCount: sStat.unpaidCount.size,
      };
    });

    const expected = cStat.expected;
    const paid = cStat.paid;
    const remaining = cStat.remaining;
    const totalStudents = cStat.students.size;
    const collectionPercent = expected > 0 ? Math.round((paid / expected) * 100) : 100;

    return {
      classId: c.id,
      className: c.name,
      totalStudents,
      expected,
      paid,
      remaining,
      collectionPercent,
      paidCount: cStat.paidCount.size,
      partialCount: cStat.partialCount.size,
      unpaidCount: cStat.unpaidCount.size,
      sections: sectionsData,
    };
  });

  return {
    sessions,
    classes,
    activeSessionId,
    kpis: {
      totalExpected,
      totalCollected,
      totalPending,
      collectionPercent: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 100,
      todayCollection,
      monthCollection,
      paidStudentsCount,
      partialStudentsCount,
      unpaidStudentsCount,
    },
    summaryRows,
    monthlyCollections,
  };
}

export interface ClasswisePendingListFilters {
  sessionId?: string;
  month?: string;
  classId?: string;
  sectionId?: string;
  feeHeadId?: string;
  minPending?: number;
  maxPending?: number;
  search?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

export async function getClasswisePendingList(filters: ClasswisePendingListFilters) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  // 1. Fetch metadata dropdowns (sessions, classes, feeheads)
  const [sessions, classes, feeHeads] = await Promise.all([
    prisma.academicSession.findMany({
      where: { schoolId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, isCurrent: true },
    }),
    prisma.class.findMany({
      where: { schoolId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        sections: {
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
    }),
    prisma.feeHead.findMany({
      where: { schoolId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const activeSessionId = filters.sessionId || sessions.find(s => s.isCurrent)?.id || sessions[0]?.id;

  const dateClause: Prisma.StudentFeeWhereInput["dueDate"] = {};
  if (filters.startDate) dateClause.gte = filters.startDate;
  if (filters.endDate) dateClause.lte = filters.endDate;

  // Query base matching student fees
  const whereClause: Prisma.StudentFeeWhereInput = {
    student: {
      schoolId,
      status: "ACTIVE",
      ...(filters.search
        ? {
            OR: [
              { fullName: { contains: filters.search } },
              { admissionNo: { contains: filters.search } },
            ],
          }
        : {}),
      ...(filters.classId || filters.sectionId || activeSessionId
        ? {
            enrollments: {
              some: {
                ...(activeSessionId ? { sessionId: activeSessionId } : {}),
                ...(filters.classId ? { classId: filters.classId } : {}),
                ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
              },
            },
          }
        : {}),
    },
    ...(activeSessionId ? { sessionId: activeSessionId } : {}),
    ...(filters.feeHeadId ? { feeHeadId: filters.feeHeadId } : {}),
    ...(filters.month ? { month: filters.month as any } : {}),
    ...(Object.keys(dateClause).length > 0 ? { dueDate: dateClause } : {}),
  };

  // We fetch the matching entries
  const studentFees = await prisma.studentFee.findMany({
    where: whereClause,
    select: {
      id: true,
      amount: true,
      discountAmount: true,
      month: true,
      status: true,
      dueDate: true,
      allocations: { select: { amount: true } },
      fine: { select: { finalAmount: true, calculatedAmount: true, waivedAmount: true } },
      feeHead: { select: { name: true } },
      student: {
        select: {
          id: true,
          fullName: true,
          admissionNo: true,
          family: { select: { fatherName: true, primaryPhone: true } },
          enrollments: {
            where: { sessionId: activeSessionId },
            include: { class: true, section: true },
            take: 1,
          },
        },
      },
    },
  });

  // Aggregate values per student
  const studentStatsMap = new Map<string, {
    studentId: string;
    studentName: string;
    admissionNo: string;
    classLabel: string;
    fatherName: string;
    phone: string;
    expectedFee: number;
    paid: number;
    pending: number;
    calculatedFine: number;
    waivedFine: number;
    finalFine: number;
    discount: number;
    monthsPending: Set<string>;
  }>();

  studentFees.forEach(fee => {
    const s = fee.student;
    const enrollment = s.enrollments[0];
    const classLabel = enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "—";
    
    const orig = decimalToNumber(fee.amount);
    const disc = decimalToNumber(fee.discountAmount);
    const calcFine = fee.fine ? decimalToNumber(fee.fine.calculatedAmount) : 0;
    const waivedFine = fee.fine ? decimalToNumber(fee.fine.waivedAmount) : 0;
    const finalFine = fee.fine ? decimalToNumber(fee.fine.finalAmount) : 0;
    const paid = decimalToNumber(sumDecimals(fee.allocations.map(a => a.amount)));

    const expected = Math.max(0, orig - disc) + finalFine;
    const pending = Math.max(0, expected - paid);

    if (!studentStatsMap.has(s.id)) {
      studentStatsMap.set(s.id, {
        studentId: s.id,
        studentName: s.fullName,
        admissionNo: s.admissionNo,
        classLabel,
        fatherName: s.family?.fatherName || "—",
        phone: s.family?.primaryPhone || "—",
        expectedFee: 0,
        paid: 0,
        pending: 0,
        calculatedFine: 0,
        waivedFine: 0,
        finalFine: 0,
        discount: 0,
        monthsPending: new Set(),
      });
    }

    const stat = studentStatsMap.get(s.id)!;
    stat.expectedFee += expected;
    stat.paid += paid;
    stat.pending += pending;
    stat.calculatedFine += calcFine;
    stat.waivedFine += waivedFine;
    stat.finalFine += finalFine;
    stat.discount += disc;

    if (pending > 0 && fee.month) {
      stat.monthsPending.add(fee.month);
    }
  });

  // Filter student aggregates based on pending range, status, etc.
  let allRows = Array.from(studentStatsMap.values()).map(s => {
    let currentStatus = "UNPAID";
    if (s.paid >= s.expectedFee && s.expectedFee > 0) {
      currentStatus = "PAID";
    } else if (s.paid > 0) {
      currentStatus = "PARTIAL";
    }

    return {
      ...s,
      monthsPending: Array.from(s.monthsPending).join(", ") || "—",
      currentStatus,
    };
  });

  // Apply filters that operate on aggregated student figures
  if (filters.status) {
    allRows = allRows.filter(r => r.currentStatus === filters.status);
  } else {
    // Default to only showing students with actual outstanding pending dues unless otherwise specified
    allRows = allRows.filter(r => r.pending > 0);
  }

  if (filters.minPending !== undefined) {
    allRows = allRows.filter(r => r.pending >= filters.minPending!);
  }
  if (filters.maxPending !== undefined) {
    allRows = allRows.filter(r => r.pending <= filters.maxPending!);
  }

  // Summary Metrics calculations
  const totalPending = allRows.reduce((sum, r) => sum + r.pending, 0);
  const studentsPending = allRows.filter(r => r.pending > 0).length;
  const averagePending = studentsPending > 0 ? Math.round(totalPending / studentsPending) : 0;
  const highestPending = allRows.length > 0 ? Math.max(...allRows.map(r => r.pending)) : 0;
  
  const totalExpectedAll = allRows.reduce((sum, r) => sum + r.expectedFee, 0);
  const totalPaidAll = allRows.reduce((sum, r) => sum + r.paid, 0);
  const collectionPercent = totalExpectedAll > 0 ? Math.round((totalPaidAll / totalExpectedAll) * 100) : 100;

  // Sorting: Default to pending amount desc
  allRows.sort((a, b) => b.pending - a.pending);

  // Pagination bounds
  const p = Math.max(1, filters.page ?? 1);
  const size = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const skip = (p - 1) * size;
  const items = allRows.slice(skip, skip + size);

  return {
    sessions,
    classes,
    feeHeads,
    activeSessionId,
    summary: {
      totalPending,
      studentsPending,
      averagePending,
      highestPending,
      collectionPercent,
    },
    items,
    total: allRows.length,
    page: p,
    pageSize: size,
  };
}

export interface ClassWiseFeeStatusFilters {
  sessionId: string;
  classId: string;
  sectionId?: string;
  month?: string;
  status?: string;
  feeHeadId?: string;
  pendingOnly?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getClassWiseFeeStatusReport(filters: ClassWiseFeeStatusFilters) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  const { sessionId, classId, sectionId, month, status, feeHeadId, pendingOnly, search, page = 1, pageSize = 20 } = filters;

  // Build filters for StudentFee query
  const whereClause: Prisma.StudentFeeWhereInput = {
    sessionId,
    student: {
      schoolId,
      status: "ACTIVE",
      enrollments: {
        some: {
          sessionId,
          classId,
          ...(sectionId ? { sectionId } : {}),
        },
      },
      ...(search
        ? {
            OR: [
              { fullName: { contains: search } },
              { admissionNo: { contains: search } },
              { family: { fatherName: { contains: search } } },
              { family: { primaryPhone: { contains: search } } },
            ],
          }
        : {}),
    },
    ...(month ? { month: month as any } : {}),
    ...(feeHeadId ? { feeHeadId } : {}),
    ...(pendingOnly ? { status: { in: [StudentFeeStatus.PENDING, StudentFeeStatus.PARTIAL, StudentFeeStatus.OVERDUE] } } : {}),
  };

  const allStudentFees = await prisma.studentFee.findMany({
    where: whereClause,
    include: {
      feeHead: { select: { id: true, name: true } },
      allocations: {
        select: {
          amount: true,
          createdAt: true,
          payment: { select: { paidAt: true } },
        },
      },
      fine: { select: { calculatedAmount: true, waivedAmount: true, finalAmount: true } },
      student: {
        select: {
          id: true,
          fullName: true,
          admissionNo: true,
          family: { select: { fatherName: true, primaryPhone: true } },
          enrollments: {
            where: { sessionId },
            include: { class: true, section: true },
            take: 1,
          },
        },
      },
    },
  });

  // Aggregate by student
  const studentMap = new Map<string, {
    studentId: string;
    studentName: string;
    admissionNo: string;
    fatherName: string;
    className: string;
    sectionName: string;
    expectedFee: number;
    paid: number;
    discount: number;
    lateFine: number;
    finalPayable: number;
    pending: number;
    lastPaymentDate: Date | null;
    receiptCount: number;
    feeDetails: Array<{
      id: string;
      month: string;
      feeHeadName: string;
      amount: number;
      discount: number;
      fine: number;
      paid: number;
      pending: number;
      status: string;
    }>;
  }>();

  allStudentFees.forEach(fee => {
    const s = fee.student;
    const enrollment = s.enrollments[0];
    const className = enrollment?.class.name || "—";
    const sectionName = enrollment?.section.name || "—";

    const orig = decimalToNumber(fee.amount);
    const disc = decimalToNumber(fee.discountAmount);
    const fine = fee.fine ? decimalToNumber(fee.fine.finalAmount) : 0;
    const paid = decimalToNumber(sumDecimals(fee.allocations.map(a => a.amount)));

    const expected = orig;
    const finalPayable = Math.max(0, orig - disc) + fine;
    const pending = Math.max(0, finalPayable - paid);

    // Get last payment date and receipt count from allocations
    let lastPayDate: Date | null = null;
    fee.allocations.forEach(alloc => {
      const payDate = alloc.payment?.paidAt || alloc.createdAt;
      if (!lastPayDate || payDate > lastPayDate) {
        lastPayDate = payDate;
      }
    });

    if (!studentMap.has(s.id)) {
      studentMap.set(s.id, {
        studentId: s.id,
        studentName: s.fullName,
        admissionNo: s.admissionNo,
        fatherName: s.family?.fatherName || "—",
        className,
        sectionName,
        expectedFee: 0,
        paid: 0,
        discount: 0,
        lateFine: 0,
        finalPayable: 0,
        pending: 0,
        lastPaymentDate: null,
        receiptCount: 0,
        feeDetails: [],
      });
    }

    const stat = studentMap.get(s.id)!;
    stat.expectedFee += expected;
    stat.paid += paid;
    stat.discount += disc;
    stat.lateFine += fine;
    stat.finalPayable += finalPayable;
    stat.pending += pending;
    stat.receiptCount += fee.allocations.length;

    if (lastPayDate) {
      const currentLast = stat.lastPaymentDate;
      if (!currentLast || (lastPayDate as any).getTime() > (currentLast as any).getTime()) {
        stat.lastPaymentDate = lastPayDate;
      }
    }

    stat.feeDetails.push({
      id: fee.id,
      month: fee.month || "ONE_TIME",
      feeHeadName: fee.feeHead.name,
      amount: orig,
      discount: disc,
      fine,
      paid,
      pending,
      status: fee.status,
    });
  });

  let aggregatedRows = Array.from(studentMap.values()).map(r => {
    let paymentStatus = "PENDING";
    if (r.paid >= r.finalPayable && r.finalPayable > 0) {
      paymentStatus = "PAID";
    } else if (r.paid > 0) {
      paymentStatus = "PARTIAL";
    }

    return {
      ...r,
      paymentStatus,
    };
  });

  // Apply optional status filter
  if (status) {
    aggregatedRows = aggregatedRows.filter(r => r.paymentStatus === status);
  }

  // Sort by name
  aggregatedRows.sort((a, b) => a.studentName.localeCompare(b.studentName));

  // Pagination
  const skip = (page - 1) * pageSize;
  const paginatedRows = aggregatedRows.slice(skip, skip + pageSize);

  return {
    items: paginatedRows,
    total: aggregatedRows.length,
    page,
    pageSize,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE REPORTS HUB — NEW REPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Shared universal search filter builder ────────────────────────────────────
function buildUniversalStudentSearch(q: string) {
  return {
    OR: [
      { fullName: { contains: q } },
      { admissionNo: { contains: q } },
      { srNo: { contains: q } },
      { family: { fatherName: { contains: q } } },
      { family: { motherName: { contains: q } } },
      { family: { primaryPhone: { contains: q } } },
      { family: { secondaryPhone: { contains: q } } },
    ],
  };
}

function buildUniversalFamilySearch(q: string) {
  return {
    OR: [
      { fatherName: { contains: q } },
      { motherName: { contains: q } },
      { primaryPhone: { contains: q } },
      { secondaryPhone: { contains: q } },
      { students: { some: { fullName: { contains: q } } } },
      { students: { some: { admissionNo: { contains: q } } } },
      { students: { some: { srNo: { contains: q } } } },
    ],
  };
}

// ── RECEIPT REGISTER FILTERS ──────────────────────────────────────────────────
export interface ReceiptRegisterFilters {
  page?: number;
  pageSize?: number;
  sessionId?: string;
  classId?: string;
  sectionId?: string;
  startDate?: Date;
  endDate?: Date;
  paymentMethod?: string;
  receiptNo?: string;
  search?: string;
}

// ── 1. RECEIPT REGISTER ───────────────────────────────────────────────────────
export async function getReceiptRegister(filters: ReceiptRegisterFilters = {}) {
  const user = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user.user as any);
  const { skip, take, page, pageSize } = parsePagination(filters.page, filters.pageSize ?? 20);

  const paymentWhere: Prisma.FamilyPaymentWhereInput = {
    family: {
      schoolId,
      ...(filters.search ? buildUniversalFamilySearch(filters.search.trim()) : {}),
    },
    ...(filters.startDate || filters.endDate
      ? {
          paidAt: {
            ...(filters.startDate ? { gte: filters.startDate } : {}),
            ...(filters.endDate ? { lte: filters.endDate } : {}),
          },
        }
      : {}),
    ...(filters.paymentMethod ? { method: filters.paymentMethod as any } : {}),
    ...(filters.receiptNo ? { receiptNo: { contains: filters.receiptNo.trim() } } : {}),
    // Class/section filter via allocations → studentFee → student → enrollments
    ...(filters.classId || filters.sectionId || filters.sessionId
      ? {
          allocations: {
            some: {
              studentFee: {
                ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
                student: {
                  enrollments: {
                    some: {
                      ...(filters.classId ? { classId: filters.classId } : {}),
                      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
                    },
                  },
                },
              },
            },
          },
        }
      : {}),
  };

  const [payments, total] = await Promise.all([
    prisma.familyPayment.findMany({
      where: paymentWhere,
      orderBy: { paidAt: "desc" },
      skip,
      take,
      include: {
        recordedBy: { select: { id: true, name: true } },
        family: {
          select: {
            id: true,
            fatherName: true,
            motherName: true,
            primaryPhone: true,
          },
        },
        allocations: {
          include: {
            student: { select: { id: true, fullName: true, admissionNo: true } },
            studentFee: {
              include: {
                feeHead: { select: { name: true } },
                student: {
                  select: {
                    fullName: true,
                    admissionNo: true,
                    enrollments: {
                      orderBy: { createdAt: "desc" },
                      take: 1,
                      include: { class: { select: { name: true } }, section: { select: { name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.familyPayment.count({ where: paymentWhere }),
  ]);

  const items = payments.map((p) => {
    // Derive "status" from whether all allocated fees are paid
    const allPaid = p.allocations.every((a) => {
      if (!a.studentFee) return true;
      return a.studentFee.status === "PAID";
    });

    // Collect unique students from allocations
    const studentsMap = new Map<string, { id: string; name: string; admissionNo: string; classSection: string }>();
    p.allocations.forEach((a) => {
      const s = a.studentFee?.student ?? a.student;
      if (s && !studentsMap.has(s.fullName)) {
        const enrollment = a.studentFee?.student?.enrollments?.[0];
        studentsMap.set(s.fullName, {
          id: a.studentId,
          name: s.fullName,
          admissionNo: s.admissionNo,
          classSection: enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "—",
        });
      }
    });

    const students = Array.from(studentsMap.values());

    return {
      id: p.id,
      receiptNo: p.receiptNo,
      paidAt: p.paidAt,
      amount: decimalToNumber(p.amount),
      method: p.method as string,
      referenceNo: p.referenceNo,
      notes: p.notes,
      status: allPaid ? "SETTLED" : "PARTIAL",
      recordedBy: p.recordedBy,
      family: p.family,
      students,
      allocationCount: p.allocations.length,
    };
  });

  return { items, total, page, pageSize };
}

// ── CASH BOOK FILTERS ─────────────────────────────────────────────────────────
export interface CashBookFilters {
  page?: number;
  pageSize?: number;
  startDate?: Date;
  endDate?: Date;
}

// ── 2. CASH BOOK (DAY BOOK) ───────────────────────────────────────────────────
export async function getCashBook(filters: CashBookFilters = {}) {
  const user = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user.user as any);
  const { skip, take, page, pageSize } = parsePagination(filters.page, filters.pageSize ?? 20);

  // Default to today if no dates given
  const now = new Date();
  const startDate = filters.startDate ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endDate = filters.endDate ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // ── Compute Opening Balance ───────────────────────────────────────────────
  // Opening = sum of all credits − debits BEFORE startDate
  const [priorPayments, priorAdvanceTx, priorCashBook] = await Promise.all([
    prisma.familyPayment.aggregate({
      where: { family: { schoolId }, paidAt: { lt: startDate } },
      _sum: { amount: true },
    }),
    prisma.advanceTransaction.findMany({
      where: { family: { schoolId }, createdAt: { lt: startDate } },
      select: { type: true, amount: true },
    }),
    prisma.cashBookEntry.aggregate({
      where: { schoolId, date: { lt: startDate }, isVoided: false },
      _sum: { amount: true },
    }),
  ]);

  // All fee payments are credits; advance tx varies; cash book entries vary
  let openingBalance = decimalToNumber(priorPayments._sum.amount ?? 0);
  priorAdvanceTx.forEach((tx) => {
    const amt = decimalToNumber(tx.amount);
    if (tx.type === "CREDIT_FROM_PAYMENT" || tx.type === "CREDIT_NOTE_ADJUSTMENT") {
      // wallet top-ups are internal, not cash-in, skip
    } else if (tx.type === "MANUAL_REFUND") {
      openingBalance -= amt; // cash refund is an outflow
    }
  });
  // CashBook entries — income types add, expense types subtract
  // We'll handle this in the summary computation

  // ── Fetch transactions for the selected period ──────────────────────────
  const [feePayments, advanceTx, cashEntries] = await Promise.all([
    prisma.familyPayment.findMany({
      where: { family: { schoolId }, paidAt: { gte: startDate, lte: endDate } },
      orderBy: { paidAt: "asc" },
      include: {
        recordedBy: { select: { name: true } },
        family: { select: { fatherName: true } },
        allocations: {
          take: 1,
          include: { student: { select: { fullName: true } } },
        },
      },
    }),
    prisma.advanceTransaction.findMany({
      where: {
        family: { schoolId },
        createdAt: { gte: startDate, lte: endDate },
        type: { in: ["MANUAL_REFUND", "CREDIT_FROM_PAYMENT"] },
      },
      orderBy: { createdAt: "asc" },
      include: {
        recordedBy: { select: { name: true } },
        family: { select: { fatherName: true } },
        targetStudent: { select: { fullName: true } },
      },
    }),
    prisma.cashBookEntry.findMany({
      where: { schoolId, date: { gte: startDate, lte: endDate }, isVoided: false },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: {
        recordedBy: { select: { name: true } },
      },
    }),
  ]);

  // ── Build unified rows ──────────────────────────────────────────────────
  type DayBookRow = {
    id: string;
    date: Date;
    voucherNo: string | null;
    transactionType: string;
    description: string;
    remarks: string | null;
    credit: number;
    debit: number;
    recordedBy: string | null;
    sourceType: "FEE_PAYMENT" | "WALLET_TX" | "CASH_BOOK";
  };

  const rows: DayBookRow[] = [];

  feePayments.forEach((p) => {
    const studentName = p.allocations[0]?.student?.fullName ?? p.family?.fatherName ?? "—";
    rows.push({
      id: p.id,
      date: p.paidAt,
      voucherNo: p.receiptNo,
      transactionType: "Fee Collection",
      description: `Fee received — ${studentName}`,
      remarks: p.notes,
      credit: decimalToNumber(p.amount),
      debit: 0,
      recordedBy: p.recordedBy?.name ?? null,
      sourceType: "FEE_PAYMENT",
    });
  });

  advanceTx.forEach((tx) => {
    const isCredit = tx.type === "CREDIT_FROM_PAYMENT";
    rows.push({
      id: tx.id,
      date: tx.createdAt,
      voucherNo: null,
      transactionType: isCredit ? "Wallet Deposit" : "Refund",
      description: tx.reason,
      remarks: tx.remarks,
      credit: isCredit ? decimalToNumber(tx.amount) : 0,
      debit: isCredit ? 0 : decimalToNumber(tx.amount),
      recordedBy: tx.recordedBy?.name ?? null,
      sourceType: "WALLET_TX",
    });
  });

  cashEntries.forEach((e) => {
    const isIncome = e.entryType === "MISC_INCOME" || e.entryType === "OTHER_INCOME";
    rows.push({
      id: e.id,
      date: e.date,
      voucherNo: e.voucherNo,
      transactionType: e.entryType.replace(/_/g, " "),
      description: e.description,
      remarks: e.remarks,
      credit: isIncome ? decimalToNumber(e.amount) : 0,
      debit: isIncome ? 0 : decimalToNumber(e.amount),
      recordedBy: e.recordedBy?.name ?? null,
      sourceType: "CASH_BOOK",
    });
  });

  // Sort all rows chronologically
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Compute summary
  let totalFeeCollection = 0;
  let totalWalletDeposit = 0;
  let totalRefunds = 0;
  let totalMiscIncome = 0;
  let totalMiscExpense = 0;

  rows.forEach((r) => {
    if (r.sourceType === "FEE_PAYMENT") totalFeeCollection += r.credit;
    else if (r.sourceType === "WALLET_TX") {
      if (r.credit > 0) totalWalletDeposit += r.credit;
      else totalRefunds += r.debit;
    } else {
      totalMiscIncome += r.credit;
      totalMiscExpense += r.debit;
    }
  });

  const totalCredits = totalFeeCollection + totalWalletDeposit + totalMiscIncome;
  const totalDebits = totalRefunds + totalMiscExpense;
  const closingBalance = openingBalance + totalCredits - totalDebits;

  // Paginate rows
  const total = rows.length;
  const paginatedRows = rows.slice(skip, skip + take);

  return {
    items: paginatedRows,
    total,
    page,
    pageSize,
    summary: {
      openingBalance,
      totalFeeCollection,
      totalWalletDeposit,
      totalMiscIncome,
      totalMiscExpense,
      totalRefunds,
      closingBalance,
    },
  };
}

// ── DISCOUNT REGISTER FILTERS ─────────────────────────────────────────────────
export interface DiscountRegisterFilters {
  page?: number;
  pageSize?: number;
  sessionId?: string;
  classId?: string;
  sectionId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

// ── 3. DISCOUNT REGISTER ─────────────────────────────────────────────────────
export async function getDiscountRegister(filters: DiscountRegisterFilters = {}) {
  const user = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user.user as any);
  const { skip, take, page, pageSize } = parsePagination(filters.page, filters.pageSize ?? 20);

  const where: Prisma.FeeDiscountWhereInput = {
    schoolId,
    ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
    ...(filters.startDate || filters.endDate
      ? {
          createdAt: {
            ...(filters.startDate ? { gte: filters.startDate } : {}),
            ...(filters.endDate ? { lte: filters.endDate } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          student: buildUniversalStudentSearch(filters.search.trim()),
        }
      : {}),
    ...(filters.classId || filters.sectionId
      ? {
          student: {
            enrollments: {
              some: {
                ...(filters.classId ? { classId: filters.classId } : {}),
                ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
              },
            },
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.feeDiscount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            admissionNo: true,
            srNo: true,
            enrollments: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                class: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        },
        feeHead: { select: { name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.feeDiscount.count({ where }),
  ]);

  return {
    items: items.map((d) => ({
      id: d.id,
      createdAt: d.createdAt,
      studentName: d.student?.fullName ?? "—",
      admissionNo: d.student?.admissionNo ?? "—",
      srNo: d.student?.srNo ?? null,
      classSection: d.student?.enrollments?.[0]
        ? `${d.student.enrollments[0].class.name}-${d.student.enrollments[0].section.name}`
        : "—",
      feeHeadName: d.feeHead?.name ?? "All Heads",
      discountType: d.discountType,
      value: decimalToNumber(d.value),
      category: d.category,
      reason: d.reason,
      status: d.status,
      approvedBy: d.approvedBy?.name ?? "System",
    })),
    total,
    page,
    pageSize,
  };
}

// ── REFUND REGISTER FILTERS ───────────────────────────────────────────────────
export interface RefundRegisterFilters {
  page?: number;
  pageSize?: number;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

// ── 4. REFUND REGISTER ────────────────────────────────────────────────────────
/**
 * Source of truth: AdvanceTransaction WHERE type = MANUAL_REFUND
 * These are cash refunds from wallet balance back to the parent.
 */
export async function getRefundRegister(filters: RefundRegisterFilters = {}) {
  const user = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user.user as any);
  const { skip, take, page, pageSize } = parsePagination(filters.page, filters.pageSize ?? 20);

  const where: Prisma.AdvanceTransactionWhereInput = {
    family: {
      schoolId,
      ...(filters.search ? buildUniversalFamilySearch(filters.search.trim()) : {}),
    },
    type: "MANUAL_REFUND",
    ...(filters.startDate || filters.endDate
      ? {
          createdAt: {
            ...(filters.startDate ? { gte: filters.startDate } : {}),
            ...(filters.endDate ? { lte: filters.endDate } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.advanceTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        family: {
          select: {
            id: true,
            fatherName: true,
            motherName: true,
            primaryPhone: true,
            students: {
              select: {
                id: true,
                fullName: true,
                admissionNo: true,
                enrollments: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  include: {
                    class: { select: { name: true } },
                    section: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        recordedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.advanceTransaction.count({ where }),
  ]);

  return {
    items: items.map((tx) => ({
      id: tx.id,
      createdAt: tx.createdAt,
      fatherName: tx.family?.fatherName ?? "—",
      motherName: tx.family?.motherName ?? null,
      phone: tx.family?.primaryPhone ?? null,
      students: tx.family?.students?.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        admissionNo: s.admissionNo,
        classSection: s.enrollments?.[0]
          ? `${s.enrollments[0].class.name}-${s.enrollments[0].section.name}`
          : "—",
      })) ?? [],
      refundAmount: decimalToNumber(tx.amount),
      walletBefore: decimalToNumber(tx.balanceBefore),
      walletAfter: decimalToNumber(tx.balanceAfter),
      reason: tx.reason,
      remarks: tx.remarks,
      processedBy: tx.recordedBy?.name ?? "System",
    })),
    total,
    page,
    pageSize,
  };
}

// ── WALLET REGISTER FILTERS ───────────────────────────────────────────────────
export interface WalletRegisterFilters {
  page?: number;
  pageSize?: number;
  sessionId?: string;
  classId?: string;
  sectionId?: string;
  search?: string;
}

// ── 5. WALLET REGISTER ────────────────────────────────────────────────────────
/**
 * Family-wise wallet summary. Top level: one row per family.
 * Expanded detail (loaded via familyId): full AdvanceTransaction history
 * with fee head info via targetStudentFeeId → StudentFee → FeeHead.
 */
export async function getWalletRegister(filters: WalletRegisterFilters = {}) {
  const user = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user.user as any);
  const { skip, take, page, pageSize } = parsePagination(filters.page, filters.pageSize ?? 20);

  const familyWhere: Prisma.FamilyWhereInput = {
    schoolId,
    advanceWallet: { isNot: null },
    ...(filters.search ? buildUniversalFamilySearch(filters.search.trim()) : {}),
    ...(filters.sessionId || filters.classId || filters.sectionId
      ? {
          students: {
            some: {
              enrollments: {
                some: {
                  ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
                  ...(filters.classId ? { classId: filters.classId } : {}),
                  ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
                },
              },
            },
          },
        }
      : {}),
  };

  const [families, total] = await Promise.all([
    prisma.family.findMany({
      where: familyWhere,
      orderBy: { fatherName: "asc" },
      skip,
      take,
      include: {
        advanceWallet: { select: { id: true, balance: true } },
        students: {
          select: {
            id: true,
            fullName: true,
            admissionNo: true,
            srNo: true,
            enrollments: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                class: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        },
        advanceTransactions: {
          select: {
            type: true,
            amount: true,
          },
        },
      },
    }),
    prisma.family.count({ where: familyWhere }),
  ]);

  const items = families.map((f) => {
    let totalDeposited = 0;
    let totalUtilized = 0;
    let totalRefunded = 0;

    f.advanceTransactions.forEach((tx) => {
      const amt = decimalToNumber(tx.amount);
      if (tx.type === "CREDIT_FROM_PAYMENT" || tx.type === "CREDIT_NOTE_ADJUSTMENT") {
        totalDeposited += amt;
      } else if (tx.type === "DEBIT_FEE_SETTLEMENT") {
        totalUtilized += amt;
      } else if (tx.type === "MANUAL_REFUND") {
        totalRefunded += amt;
      }
    });

    return {
      familyId: f.id,
      fatherName: f.fatherName ?? "—",
      motherName: f.motherName ?? null,
      primaryPhone: f.primaryPhone ?? null,
      walletBalance: f.advanceWallet ? decimalToNumber(f.advanceWallet.balance) : 0,
      totalDeposited,
      totalUtilized,
      totalRefunded,
      children: f.students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        admissionNo: s.admissionNo,
        srNo: s.srNo,
        classSection: s.enrollments?.[0]
          ? `${s.enrollments[0].class.name}-${s.enrollments[0].section.name}`
          : "—",
      })),
    };
  });

  return { items, total, page, pageSize };
}

// ── WALLET DETAIL (for expanded row) ─────────────────────────────────────────
export async function getWalletDetail(familyId: string) {
  const user = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user.user as any);

  const family = await prisma.family.findFirst({
    where: { id: familyId, schoolId },
    select: { id: true, fatherName: true },
  });
  if (!family) throw new Error("Family not found");

  const transactions = await prisma.advanceTransaction.findMany({
    where: { familyId },
    orderBy: { createdAt: "desc" },
    include: {
      recordedBy: { select: { name: true } },
      targetStudent: { select: { fullName: true, admissionNo: true } },
      targetStudentFee: {
        include: {
          feeHead: { select: { name: true } },
        },
      },
    },
  });

  return {
    familyId,
    fatherName: family.fatherName,
    transactions: transactions.map((tx) => ({
      id: tx.id,
      createdAt: tx.createdAt,
      type: tx.type,
      amount: decimalToNumber(tx.amount),
      balanceBefore: decimalToNumber(tx.balanceBefore),
      balanceAfter: decimalToNumber(tx.balanceAfter),
      reason: tx.reason,
      remarks: tx.remarks,
      recordedBy: tx.recordedBy?.name ?? "System",
      targetStudent: tx.targetStudent
        ? { fullName: tx.targetStudent.fullName, admissionNo: tx.targetStudent.admissionNo }
        : null,
      feeHead: tx.targetStudentFee?.feeHead?.name ?? null,
    })),
  };
}

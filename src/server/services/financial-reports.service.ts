import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { decimalToNumber, schoolIdFromUser, sumDecimals } from "@/server/lib/helpers";

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

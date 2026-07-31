import { Prisma, Role, StudentStatus } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { decimalToNumber, schoolIdFromUser, sumDecimals, toDecimal } from "@/server/lib/helpers";
import { calculateFineForFee, generateOrUpdateStudentFeeFineInTx } from "./fine.service";

export interface MonthlyFeeRow {
  month: string;
  monthName: string;
  originalAmount: number;
  discountAmount: number;
  calculatedFine: number;
  waivedFine: number;
  finalFine: number;
  netDue: number;
  paidAmount: number;
  remaining: number;
  status: string;
  dueDate: Date | null;
  items: Array<{
    studentFeeId: string;
    feeHeadId: string;
    feeHeadName: string;
    originalAmount: number;
    discountAmount: number;
    calculatedFine: number;
    waivedFine: number;
    finalFine: number;
    paidAmount: number;
    remaining: number;
    status: string;
  }>;
}

export async function getStudentFinancialProfile(
  studentId: string,
  sessionIdInput?: string,
  userOverride?: { id: string; role: Role; schoolId?: string | null; studentId?: string | null },
) {
  const user = userOverride ?? (await requirePermission("fee.view")).user;
  const schoolId = schoolIdFromUser(user as any);

  if (user.role === Role.STUDENT && user.studentId !== studentId) {
    throw new Error("FORBIDDEN");
  }

  // 1. Fetch Student Header & Family Details
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      family: true,
      enrollments: {
        include: { class: true, section: true, session: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!student) throw new Error("Student not found");

  const currentEnrollment = student.enrollments[0] ?? null;
  const targetSessionId = sessionIdInput || currentEnrollment?.sessionId;

  // Auto-sync ledger check: ensure student's ledger contains the full class structure
  if (currentEnrollment && targetSessionId) {
    const { generateStudentMonthlyLedgerInTx } = await import("@/server/services/fee.service");
    try {
      await prisma.$transaction(async (tx) => {
        await generateStudentMonthlyLedgerInTx(tx, {
          schoolId,
          studentId,
          sessionId: targetSessionId,
          classId: currentEnrollment.classId,
          userId: user.id || null,
        });
      });
    } catch (e) {
      console.error("Auto-sync ledger check failed:", e);
    }
  }

  // 2. Parallel Querying of All Financial Entities to avoid N+1
  const [
    sessions,
    studentFees,
    familyWallet,
    advanceTransactions,
    discounts,
    familySiblings,
  ] = await Promise.all([
    prisma.academicSession.findMany({
      where: { schoolId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true },
    }),
    prisma.studentFee.findMany({
      where: {
        studentId,
        ...(targetSessionId ? { sessionId: targetSessionId } : {}),
      },
      include: {
        feeHead: { select: { id: true, name: true } },
        session: { select: { id: true, name: true, startDate: true, isCurrent: true } },
        allocations: {
          include: {
            payment: {
              select: {
                id: true,
                receiptNo: true,
                paidAt: true,
                method: true,
                referenceNo: true,
                amount: true,
                notes: true,
                recordedBy: { select: { id: true, name: true } },
              },
            },
          },
        },
        fine: {
          include: {
            lateRule: { select: { id: true, name: true, calculationType: true, graceDays: true } },
            waivedBy: { select: { id: true, name: true } },
            allocations: true,
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.familyAdvanceWallet.findUnique({
      where: { familyId: student.familyId },
    }),
    prisma.advanceTransaction.findMany({
      where: { familyId: student.familyId },
      include: {
        recordedBy: { select: { id: true, name: true } },
        targetStudent: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.feeDiscount.findMany({
      where: {
        studentId,
        ...(targetSessionId ? { sessionId: targetSessionId } : {}),
      },
      include: {
        feeHead: { select: { id: true, name: true } },
        session: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.student.findMany({
      where: {
        familyId: student.familyId,
        id: { not: studentId },
        schoolId,
      },
      include: {
        enrollments: {
          include: { class: true, section: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        studentFees: {
          include: { allocations: true, fine: true },
        },
      },
    }),
  ]);

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      schoolId,
      OR: [
        { entityType: "StudentFee", entityId: { in: studentFees.map((f) => f.id) } },
        { entityType: "FeeDiscount", entityId: { in: discounts.map((d) => d.id) } },
        { entityType: "StudentFeeFine" },
        { entityType: "FamilyPayment" },
        { entityType: "FamilyAdvanceWallet" },
      ],
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // 3. Process Monthly Matrix & Breakdown
  const monthMap = new Map<string, MonthlyFeeRow>();

  let totalAnnualFee = 0;
  let totalDiscounts = 0;
  let totalCalculatedFine = 0;
  let totalWaivedFine = 0;
  let totalFinalFine = 0;
  let totalPaid = 0;
  let totalRemaining = 0;
  let currentSessionDue = 0;
  let previousArrears = 0;

  for (const fee of studentFees) {
    const monthKey = fee.month ?? "OTHER";
    const origAmt = decimalToNumber(fee.amount);
    const discAmt = decimalToNumber(fee.discountAmount);

    const calcFineAmt = fee.fine ? decimalToNumber(fee.fine.calculatedAmount) : 0;
    const waivedFineAmt = fee.fine ? decimalToNumber(fee.fine.waivedAmount) : 0;
    const finalFineAmt = fee.fine ? decimalToNumber(fee.fine.finalAmount) : 0;

    const netFee = Math.max(0, origAmt - discAmt);
    const totalLineNetDue = netFee + finalFineAmt;

    const paidFeeAmt = decimalToNumber(sumDecimals(fee.allocations.map((a) => a.amount)));
    const remainingLineDue = Math.max(0, totalLineNetDue - paidFeeAmt);

    totalAnnualFee += origAmt;
    totalDiscounts += discAmt;
    totalCalculatedFine += calcFineAmt;
    totalWaivedFine += waivedFineAmt;
    totalFinalFine += finalFineAmt;
    totalPaid += paidFeeAmt;
    totalRemaining += remainingLineDue;

    if (fee.session?.isCurrent || fee.sessionId === targetSessionId) {
      currentSessionDue += remainingLineDue;
    } else {
      previousArrears += remainingLineDue;
    }

    const headItem = {
      studentFeeId: fee.id,
      feeHeadId: fee.feeHead.id,
      feeHeadName: fee.feeHead.name,
      originalAmount: origAmt,
      discountAmount: discAmt,
      calculatedFine: calcFineAmt,
      waivedFine: waivedFineAmt,
      finalFine: finalFineAmt,
      paidAmount: paidFeeAmt,
      remaining: remainingLineDue,
      status: fee.status,
    };

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        month: monthKey,
        monthName: monthKey,
        originalAmount: origAmt,
        discountAmount: discAmt,
        calculatedFine: calcFineAmt,
        waivedFine: waivedFineAmt,
        finalFine: finalFineAmt,
        netDue: totalLineNetDue,
        paidAmount: paidFeeAmt,
        remaining: remainingLineDue,
        status: fee.status,
        dueDate: fee.dueDate,
        items: [headItem],
      });
    } else {
      const existing = monthMap.get(monthKey)!;
      existing.originalAmount += origAmt;
      existing.discountAmount += discAmt;
      existing.calculatedFine += calcFineAmt;
      existing.waivedFine += waivedFineAmt;
      existing.finalFine += finalFineAmt;
      existing.netDue += totalLineNetDue;
      existing.paidAmount += paidFeeAmt;
      existing.remaining += remainingLineDue;
      existing.items.push(headItem);
    }
  }

  // 4. Process Payment History (Deduplicate payments across allocations)
  const paymentMap = new Map<
    string,
    {
      id: string;
      receiptNo: string;
      paidAt: Date;
      method: string;
      referenceNo: string | null;
      notes: string | null;
      amount: number;
      allocatedToStudent: number;
      recordedBy: string | null;
      allocations: Array<{ studentFeeId: string; month: string; feeHead: string; amount: number }>;
    }
  >();

  for (const fee of studentFees) {
    for (const alloc of fee.allocations) {
      if (!alloc.paymentId || !alloc.payment) continue;

      const p = alloc.payment;
      const allocAmt = decimalToNumber(alloc.amount);
      const existing = paymentMap.get(p.id);

      if (existing) {
        existing.allocatedToStudent += allocAmt;
        existing.allocations.push({
          studentFeeId: fee.id,
          month: fee.month || "OTHER",
          feeHead: fee.feeHead.name,
          amount: allocAmt,
        });
      } else {
        paymentMap.set(p.id, {
          id: p.id,
          receiptNo: p.receiptNo,
          paidAt: p.paidAt,
          method: p.method,
          referenceNo: p.referenceNo,
          notes: p.notes,
          amount: decimalToNumber(p.amount),
          allocatedToStudent: allocAmt,
          recordedBy: p.recordedBy ? p.recordedBy.name : null,
          allocations: [{
            studentFeeId: fee.id,
            month: fee.month || "OTHER",
            feeHead: fee.feeHead.name,
            amount: allocAmt,
          }],
        });
      }
    }
  }

  const paymentHistory = Array.from(paymentMap.values()).sort(
    (a, b) => b.paidAt.getTime() - a.paidAt.getTime(),
  );

  // 5. Process Sibling Overview
  const siblingsSummary = familySiblings.map((s) => {
    const sFees = s.studentFees || [];
    const sTotal = sFees.reduce((sum, f) => sum + decimalToNumber(f.amount), 0);
    const sDisc = sFees.reduce((sum, f) => sum + decimalToNumber(f.discountAmount), 0);
    const sFine = sFees.reduce((sum, f) => sum + (f.fine ? decimalToNumber(f.fine.finalAmount) : 0), 0);
    const sPaid = sFees.reduce(
      (sum, f) => sum + decimalToNumber(sumDecimals((f.allocations || []).map((a) => a.amount))),
      0,
    );
    const sNet = sTotal - sDisc + sFine;
    const sRemaining = Math.max(0, sNet - sPaid);

    const enrollment = s.enrollments[0];
    return {
      id: s.id,
      fullName: s.fullName,
      admissionNo: s.admissionNo,
      classLabel: enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "—",
      status: s.status,
      totalFee: sTotal,
      discounts: sDisc,
      fines: sFine,
      paid: sPaid,
      remaining: sRemaining,
    };
  });

  const walletBalance = familyWallet ? decimalToNumber(familyWallet.balance) : 0;

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      admissionNo: student.admissionNo,
      dateOfBirth: student.dateOfBirth,
      admissionDate: student.admissionDate,
      status: student.status,
      family: {
        id: student.family.id,
        fatherName: student.family.fatherName,
        motherName: student.family.motherName,
        primaryPhone: student.family.primaryPhone,
        address: [
          student.family.addressLine1,
          student.family.city,
          student.family.state,
        ].filter(Boolean).join(", "),
      },
      currentEnrollment: currentEnrollment
        ? {
            className: currentEnrollment.class.name,
            sectionName: currentEnrollment.section.name,
            sessionName: currentEnrollment.session.name,
            label: `${currentEnrollment.class.name}-${currentEnrollment.section.name}`,
          }
        : null,
    },
    sessions: sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent })),
    summary: {
      totalAnnualFee,
      totalDiscounts,
      totalCalculatedFine,
      totalWaivedFine,
      totalFinalFine,
      totalNetPayable: totalAnnualFee - totalDiscounts + totalFinalFine,
      totalPaid,
      totalRemaining,
      walletBalance,
      currentSessionDue,
      previousArrears,
    },
    monthlyMatrix: Array.from(monthMap.values()),
    paymentHistory,
    walletHistory: advanceTransactions.map((tx) => ({
      id: tx.id,
      createdAt: tx.createdAt,
      type: tx.type,
      amount: decimalToNumber(tx.amount),
      balanceBefore: decimalToNumber(tx.balanceBefore),
      balanceAfter: decimalToNumber(tx.balanceAfter),
      reason: tx.reason,
      remarks: tx.remarks,
      recordedBy: tx.recordedBy ? tx.recordedBy.name : null,
      targetStudent: tx.targetStudent ? tx.targetStudent.fullName : null,
    })),
    discounts: discounts.map((d) => ({
      id: d.id,
      category: d.category,
      discountType: d.discountType,
      value: decimalToNumber(d.value),
      feeHeadName: d.feeHead ? d.feeHead.name : "All Fee Heads",
      month: d.month,
      reason: d.reason,
      remarks: d.remarks,
      status: d.status,
      approvedBy: d.approvedBy ? d.approvedBy.name : null,
      approvedAt: d.approvedAt,
    })),
    fines: studentFees
      .filter((f) => f.fine)
      .map((f) => ({
        id: f.fine!.id,
        feeHeadName: f.feeHead.name,
        month: f.month,
        ruleName: f.fine!.lateRule ? f.fine!.lateRule.name : "System Late Fee",
        calculationType: f.fine!.lateRule ? f.fine!.lateRule.calculationType : "FIXED",
        calculatedAmount: decimalToNumber(f.fine!.calculatedAmount),
        waivedAmount: decimalToNumber(f.fine!.waivedAmount),
        finalAmount: decimalToNumber(f.fine!.finalAmount),
        paidAmount: decimalToNumber(f.fine!.paidAmount),
        status: f.fine!.status,
        waivedBy: f.fine!.waivedBy ? f.fine!.waivedBy.name : null,
        waiveReason: f.fine!.waiveReason,
      })),
    siblings: siblingsSummary,
    auditTimeline: auditLogs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      user: log.user ? log.user.name : "System",
      newValue: log.newValue,
    })),
  };
}

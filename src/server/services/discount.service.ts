import { AdvanceTransactionType, DiscountCategory, DiscountStatus, DiscountType, FeeMonth, Prisma } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import {
  decimalToNumber,
  parsePagination,
  schoolIdFromUser,
  sumDecimals,
  toDecimal,
} from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  createFeeDiscountSchema,
  listStudentDiscountsSchema,
  revokeFeeDiscountSchema,
  type CreateFeeDiscountInput,
  type ListStudentDiscountsInput,
  type RevokeFeeDiscountInput,
} from "@/server/validators/discount.validator";
import { recalcStudentFeeStatus } from "./fee.service";
import { recordWalletTransactionInTx, reconcileFamilyAdvanceInTx } from "./wallet.service";

/**
 * Calculate applicable discount amount for a given fee amount.
 */
export function calculateDiscountForAmount(
  discountType: DiscountType,
  value: Prisma.Decimal | number,
  feeAmount: Prisma.Decimal | number,
): Prisma.Decimal {
  const feeDec = toDecimal(feeAmount);
  const valDec = toDecimal(value);

  if (feeDec.lessThanOrEqualTo(0)) return toDecimal(0);

  if (discountType === DiscountType.PERCENTAGE) {
    if (valDec.lessThanOrEqualTo(0)) return toDecimal(0);
    if (valDec.greaterThan(100)) return feeDec; // Cap at 100%
    const calculated = feeDec.mul(valDec.div(100));
    return calculated.greaterThan(feeDec) ? feeDec : calculated;
  }

  // FIXED_AMOUNT
  if (valDec.lessThanOrEqualTo(0)) return toDecimal(0);
  return valDec.greaterThan(feeDec) ? feeDec : valDec;
}

/**
 * Transactionally create and apply a FeeDiscount.
 * Enforces validation, application rules, and retrospective concession handling:
 * - Unpaid/partial fees: Updates StudentFee.discountAmount and status.
 * - Already-paid fees: Credits excess paid amount to FamilyAdvanceWallet (CREDIT_NOTE_ADJUSTMENT).
 * - Triggers auto-reconciliation for any new wallet credit.
 */
export async function createFeeDiscountInTx(
  tx: Prisma.TransactionClient,
  opts: {
    schoolId: string;
    studentId: string;
    sessionId: string;
    feeHeadId?: string | null;
    month?: FeeMonth | null;
    discountType: DiscountType;
    value: Prisma.Decimal | number;
    category: DiscountCategory;
    reason: string;
    remarks?: string | null;
    effectiveFrom?: Date;
    effectiveTill?: Date | null;
    userId?: string | null;
  },
) {
  const student = await tx.student.findFirst({
    where: { id: opts.studentId, schoolId: opts.schoolId },
    select: { id: true, familyId: true },
  });
  if (!student) throw new Error("Student not found in this school");

  const session = await tx.academicSession.findFirst({
    where: { id: opts.sessionId, schoolId: opts.schoolId },
  });
  if (!session) throw new Error("Academic session not found");

  if (opts.feeHeadId) {
    const feeHead = await tx.feeHead.findFirst({
      where: { id: opts.feeHeadId, schoolId: opts.schoolId },
    });
    if (!feeHead) throw new Error("Fee head not found");
  }

  const valDecimal = toDecimal(opts.value);
  if (valDecimal.lessThanOrEqualTo(0)) {
    throw new Error("Discount value must be greater than zero");
  }
  if (opts.discountType === DiscountType.PERCENTAGE && valDecimal.greaterThan(100)) {
    throw new Error("Percentage discount cannot exceed 100%");
  }

  // NOTE: Multiple discounts of the same category are allowed.
  // Schools may need multiple concessions (e.g. MERIT for different fee heads/months).

  // 1. Create FeeDiscount record
  const discount = await tx.feeDiscount.create({
    data: {
      schoolId: opts.schoolId,
      studentId: opts.studentId,
      sessionId: opts.sessionId,
      feeHeadId: opts.feeHeadId ?? null,
      month: opts.month ?? null,
      discountType: opts.discountType,
      value: valDecimal,
      category: opts.category,
      reason: opts.reason.trim(),
      remarks: opts.remarks?.trim() ?? null,
      approvedById: opts.userId ?? null,
      approvedAt: new Date(),
      effectiveFrom: opts.effectiveFrom ?? new Date(),
      effectiveTill: opts.effectiveTill ?? null,
      status: DiscountStatus.ACTIVE,
    },
  });

  // 2. Query target StudentFee records
  const feeHeadFilter = opts.feeHeadId ? { feeHeadId: opts.feeHeadId } : {};
  const monthFilter = opts.month ? { month: opts.month } : {};

  const matchingFees = await tx.studentFee.findMany({
    where: {
      studentId: opts.studentId,
      sessionId: opts.sessionId,
      status: { not: "PAID" }, // Only apply concessions to unpaid/partial fees
      ...feeHeadFilter,
      ...monthFilter,
    },
    include: {
      allocations: true,
      feeHead: true,
    },
  });

  if (matchingFees.length === 0) {
    throw new Error("No unpaid fees found to apply this concession");
  }

  let totalRetrospectiveCredit = toDecimal(0);
  let affectedFeesCount = 0;

  /**
   * Helper: apply a specific discount amount to a single StudentFee record,
   * handle retrospective credit if already overpaid, and recalc status.
   */
  async function applyToFee(
    fee: (typeof matchingFees)[number],
    discountAmt: Prisma.Decimal,
  ) {
    if (discountAmt.lessThanOrEqualTo(0)) return toDecimal(0);

    const currentDiscount = toDecimal(fee.discountAmount);
    const newTotalDiscount = currentDiscount.add(discountAmt);
    const cappedDiscount = newTotalDiscount.greaterThan(toDecimal(fee.amount))
      ? toDecimal(fee.amount)
      : newTotalDiscount;

    const actualApplied = cappedDiscount.sub(currentDiscount);
    if (actualApplied.lessThanOrEqualTo(0)) return toDecimal(0);

    await tx.studentFee.update({
      where: { id: fee.id },
      data: { discountAmount: cappedDiscount },
    });

    affectedFeesCount++;

    const alreadyPaid = sumDecimals(fee.allocations.map((a) => a.amount));
    const netBillable = toDecimal(fee.amount).sub(cappedDiscount);

    if (alreadyPaid.greaterThan(netBillable)) {
      const overpayment = alreadyPaid.sub(netBillable);
      if (overpayment.greaterThan(0)) {
        await recordWalletTransactionInTx(tx, {
          familyId: student!.familyId,
          type: AdvanceTransactionType.CREDIT_NOTE_ADJUSTMENT,
          amount: overpayment,
          targetStudentId: opts.studentId,
          targetStudentFeeId: fee.id,
          reason: `Retrospective ${opts.category} concession adjustment for ${fee.feeHead.name}`,
          userId: opts.userId,
        });
        totalRetrospectiveCredit = totalRetrospectiveCredit.add(overpayment);
      }
    }

    await recalcStudentFeeStatus(tx, fee.id);
    return actualApplied;
  }

  // FIXED_AMOUNT with "All Fee Heads": apply ₹X once per MONTH (not per fee head)
  // PERCENTAGE or specific feeHead: apply to each matching fee individually
  const applyPerMonth =
    opts.discountType === DiscountType.FIXED_AMOUNT && !opts.feeHeadId;

  if (applyPerMonth) {
    // Group fees by month
    const feesByMonth = new Map<string, (typeof matchingFees)>();
    for (const fee of matchingFees) {
      const key = fee.month ?? "OTHER";
      if (!feesByMonth.has(key)) feesByMonth.set(key, []);
      feesByMonth.get(key)!.push(fee);
    }

    for (const [, monthFees] of feesByMonth) {
      // Distribute the fixed discount amount across fee heads in this month
      let remainingForMonth = toDecimal(valDecimal);
      for (const fee of monthFees) {
        if (remainingForMonth.lessThanOrEqualTo(0)) break;
        const feeAmt = toDecimal(fee.amount);
        const currentDisc = toDecimal(fee.discountAmount);
        const room = feeAmt.sub(currentDisc);
        if (room.lessThanOrEqualTo(0)) continue;

        const toApply = remainingForMonth.greaterThan(room)
          ? room
          : remainingForMonth;
        const applied = await applyToFee(fee, toApply);
        remainingForMonth = remainingForMonth.sub(applied);
      }
    }
  } else {
    // Per-fee-head application (PERCENTAGE or specific feeHead)
    for (const fee of matchingFees) {
      const calculatedDiscount = calculateDiscountForAmount(
        opts.discountType,
        valDecimal,
        fee.amount,
      );
      await applyToFee(fee, calculatedDiscount);
    }
  }

  // Auto-reconciliation trigger for retrospective wallet credit
  if (totalRetrospectiveCredit.greaterThan(0)) {
    await reconcileFamilyAdvanceInTx(tx, {
      schoolId: opts.schoolId,
      familyId: student.familyId,
      userId: opts.userId,
    });
  }

  if (opts.userId) {
    await writeAuditLog(
      {
        schoolId: opts.schoolId,
        userId: opts.userId,
        action: "create",
        module: "fee",
        entityType: "FeeDiscount",
        entityId: discount.id,
        newValue: {
          category: opts.category,
          discountType: opts.discountType,
          value: decimalToNumber(valDecimal),
          affectedFeesCount,
          retrospectiveCredit: decimalToNumber(totalRetrospectiveCredit),
        },
      },
      tx,
    );
  }

  return { discount, affectedFeesCount, retrospectiveCreditAmount: totalRetrospectiveCredit };
}

/** Public permission-checked entrypoint to create a discount */
export async function createFeeDiscount(input: CreateFeeDiscountInput) {
  const { user } = await requirePermission("fee.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createFeeDiscountSchema, input);

  return prisma.$transaction(async (tx) => {
    return createFeeDiscountInTx(tx, {
      ...data,
      schoolId,
      userId: user.id,
    });
  });
}

/** Transactional revocation of a FeeDiscount */
export async function revokeFeeDiscountInTx(
  tx: Prisma.TransactionClient,
  opts: {
    discountId: string;
    reason: string;
    userId?: string | null;
  },
) {
  const discount = await tx.feeDiscount.findUnique({
    where: { id: opts.discountId },
  });
  if (!discount || discount.status !== DiscountStatus.ACTIVE) {
    throw new Error("Active discount not found");
  }

  // Update status to REVOKED
  const updatedDiscount = await tx.feeDiscount.update({
    where: { id: opts.discountId },
    data: { status: DiscountStatus.REVOKED },
  });

  // Re-calculate discounts for affected StudentFee records
  const feeHeadFilter = discount.feeHeadId ? { feeHeadId: discount.feeHeadId } : {};
  const monthFilter = discount.month ? { month: discount.month } : {};

  const matchingFees = await tx.studentFee.findMany({
    where: {
      studentId: discount.studentId,
      sessionId: discount.sessionId,
      ...feeHeadFilter,
      ...monthFilter,
    },
  });

  // Fetch remaining ACTIVE discounts for the student
  const remainingDiscounts = await tx.feeDiscount.findMany({
    where: {
      studentId: discount.studentId,
      sessionId: discount.sessionId,
      status: DiscountStatus.ACTIVE,
    },
  });

  for (const fee of matchingFees) {
    let newDiscountTotal = toDecimal(0);
    for (const rd of remainingDiscounts) {
      if (rd.feeHeadId && rd.feeHeadId !== fee.feeHeadId) continue;
      if (rd.month && rd.month !== fee.month) continue;

      const amt = calculateDiscountForAmount(rd.discountType, rd.value, fee.amount);
      newDiscountTotal = newDiscountTotal.add(amt);
    }

    const capped = newDiscountTotal.greaterThan(toDecimal(fee.amount))
      ? toDecimal(fee.amount)
      : newDiscountTotal;

    await tx.studentFee.update({
      where: { id: fee.id },
      data: { discountAmount: capped },
    });

    await recalcStudentFeeStatus(tx, fee.id);
  }

  if (opts.userId) {
    await writeAuditLog(
      {
        schoolId: discount.schoolId,
        userId: opts.userId,
        action: "revoke",
        module: "fee",
        entityType: "FeeDiscount",
        entityId: discount.id,
        newValue: { reason: opts.reason },
      },
      tx,
    );
  }

  return updatedDiscount;
}

/** Public entrypoint to revoke a discount */
export async function revokeFeeDiscount(input: RevokeFeeDiscountInput) {
  const { user } = await requirePermission("fee.update");
  const data = parseOrThrow(revokeFeeDiscountSchema, input);

  return prisma.$transaction(async (tx) => {
    return revokeFeeDiscountInTx(tx, {
      ...data,
      userId: user.id,
    });
  });
}

/** List student discounts */
export async function listStudentDiscounts(input: ListStudentDiscountsInput) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listStudentDiscountsSchema, input);
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const studentFilter = params.studentId ? { studentId: params.studentId } : {};
  const sessionFilter = params.sessionId ? { sessionId: params.sessionId } : {};

  const where = {
    schoolId,
    ...studentFilter,
    ...sessionFilter,
  };

  const [items, total] = await Promise.all([
    prisma.feeDiscount.findMany({
      where,
      include: {
        feeHead: { select: { id: true, name: true } },
        session: { select: { id: true, name: true } },
        student: { select: { id: true, fullName: true, admissionNo: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.feeDiscount.count({ where }),
  ]);

  return {
    items: items.map((d) => ({
      id: d.id,
      studentId: d.studentId,
      student: d.student ? { id: d.student.id, fullName: d.student.fullName, admissionNo: d.student.admissionNo } : null,
      sessionId: d.sessionId,
      sessionName: d.session.name,
      feeHeadId: d.feeHeadId,
      feeHeadName: d.feeHead ? d.feeHead.name : "All Fee Heads",
      month: d.month,
      discountType: d.discountType,
      value: decimalToNumber(d.value),
      category: d.category,
      reason: d.reason,
      remarks: d.remarks,
      status: d.status,
      approvedBy: d.approvedBy ? { id: d.approvedBy.id, name: d.approvedBy.name } : null,
      approvedAt: d.approvedAt,
      effectiveFrom: d.effectiveFrom,
      effectiveTill: d.effectiveTill,
      createdAt: d.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

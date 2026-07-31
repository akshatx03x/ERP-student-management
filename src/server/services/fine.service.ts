import {
  FeeLateRule,
  LateFeeCalculationType,
  Prisma,
  StudentFeeFineStatus,
} from "@prisma/client";
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
  createFeeLateRuleSchema,
  listFeeLateRulesSchema,
  updateFeeLateRuleSchema,
  waiveStudentFineSchema,
  type CreateFeeLateRuleInput,
  type ListFeeLateRulesInput,
  type UpdateFeeLateRuleInput,
  type WaiveStudentFineInput,
} from "@/server/validators/fine.validator";

/**
 * Pure calculation function for Late Fee Fines.
 * Enforces grace days, calculation type (FIXED, PERCENTAGE, PER_DAY, PER_MONTH), and maximum cap.
 */
export function calculateFineForFee(
  rule: {
    graceDays: number;
    calculationType: LateFeeCalculationType;
    fixedAmount?: Prisma.Decimal | number | null;
    percentage?: Prisma.Decimal | number | null;
    applyPerDay?: Prisma.Decimal | number | null;
    applyPerMonth?: Prisma.Decimal | number | null;
    maxFine?: Prisma.Decimal | number | null;
    applicableFeeHeads?: string | null;
  },
  fee: {
    feeHeadId: string;
    amount: Prisma.Decimal | number;
    discountAmount?: Prisma.Decimal | number | null;
    dueDate?: Date | null;
  },
  calcDate: Date = new Date(),
): Prisma.Decimal {
  if (!fee.dueDate) return toDecimal(0);

  // Check applicable fee heads filter
  if (rule.applicableFeeHeads) {
    try {
      const allowedHeads: string[] = JSON.parse(rule.applicableFeeHeads);
      if (Array.isArray(allowedHeads) && allowedHeads.length > 0) {
        if (!allowedHeads.includes(fee.feeHeadId)) return toDecimal(0);
      }
    } catch {
      // If parsing fails, allow all
    }
  }

  // Add grace days to due date
  const dueDateWithGrace = new Date(fee.dueDate);
  dueDateWithGrace.setDate(dueDateWithGrace.getDate() + rule.graceDays);
  dueDateWithGrace.setHours(23, 59, 59, 999);

  if (calcDate <= dueDateWithGrace) {
    return toDecimal(0); // Within grace period
  }

  const diffTime = calcDate.getTime() - dueDateWithGrace.getTime();
  const delayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (delayDays <= 0) return toDecimal(0);

  const origFee = toDecimal(fee.amount);
  const discFee = toDecimal(fee.discountAmount ?? 0);
  const netFeeAmount = origFee.sub(discFee).lessThan(0) ? toDecimal(0) : origFee.sub(discFee);

  let fineAmount = toDecimal(0);

  switch (rule.calculationType) {
    case LateFeeCalculationType.FIXED:
      fineAmount = toDecimal(rule.fixedAmount ?? 0);
      break;

    case LateFeeCalculationType.PERCENTAGE: {
      const pct = toDecimal(rule.percentage ?? 0);
      fineAmount = netFeeAmount.mul(pct.div(100));
      break;
    }

    case LateFeeCalculationType.PER_DAY: {
      const ratePerDay = toDecimal(rule.applyPerDay ?? rule.fixedAmount ?? 0);
      fineAmount = ratePerDay.mul(delayDays);
      break;
    }

    case LateFeeCalculationType.PER_MONTH: {
      const monthsDelayed = Math.ceil(delayDays / 30);
      const ratePerMonth = toDecimal(rule.applyPerMonth ?? rule.fixedAmount ?? 0);
      fineAmount = ratePerMonth.mul(monthsDelayed);
      break;
    }
  }

  // Apply maximum fine cap if defined
  if (rule.maxFine) {
    const maxCap = toDecimal(rule.maxFine);
    if (fineAmount.greaterThan(maxCap)) {
      fineAmount = maxCap;
    }
  }

  return fineAmount.lessThan(0) ? toDecimal(0) : fineAmount;
}

/** Transactional creation of a FeeLateRule */
export async function createFeeLateRuleInTx(
  tx: Prisma.TransactionClient,
  opts: {
    schoolId: string;
    sessionId: string;
    name: string;
    isActive?: boolean;
    effectiveFrom?: Date;
    effectiveTill?: Date | null;
    graceDays?: number;
    calculationType: LateFeeCalculationType;
    fixedAmount?: Prisma.Decimal | number | null;
    percentage?: Prisma.Decimal | number | null;
    applyPerDay?: Prisma.Decimal | number | null;
    applyPerMonth?: Prisma.Decimal | number | null;
    maxFine?: Prisma.Decimal | number | null;
    applicableFeeHeadIds?: string[] | null;
    priority?: number;
    userId?: string | null;
  },
) {
  const rule = await tx.feeLateRule.create({
    data: {
      schoolId: opts.schoolId,
      sessionId: opts.sessionId,
      name: opts.name.trim(),
      isActive: opts.isActive ?? true,
      effectiveFrom: opts.effectiveFrom ?? new Date(),
      effectiveTill: opts.effectiveTill ?? null,
      graceDays: opts.graceDays ?? 0,
      calculationType: opts.calculationType,
      fixedAmount: opts.fixedAmount != null ? toDecimal(opts.fixedAmount) : null,
      percentage: opts.percentage != null ? toDecimal(opts.percentage) : null,
      applyPerDay: opts.applyPerDay != null ? toDecimal(opts.applyPerDay) : null,
      applyPerMonth: opts.applyPerMonth != null ? toDecimal(opts.applyPerMonth) : null,
      maxFine: opts.maxFine != null ? toDecimal(opts.maxFine) : null,
      applicableFeeHeads: opts.applicableFeeHeadIds ? JSON.stringify(opts.applicableFeeHeadIds) : null,
      priority: opts.priority ?? 0,
      createdByUserId: opts.userId ?? null,
    },
  });

  if (opts.userId) {
    await writeAuditLog(
      {
        schoolId: opts.schoolId,
        userId: opts.userId,
        action: "create",
        module: "fee",
        entityType: "FeeLateRule",
        entityId: rule.id,
        newValue: rule,
      },
      tx,
    );
  }

  return rule;
}

export async function createFeeLateRule(input: CreateFeeLateRuleInput) {
  const { user } = await requirePermission("fee.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createFeeLateRuleSchema, input);

  return prisma.$transaction(async (tx) => {
    return createFeeLateRuleInTx(tx, {
      ...data,
      schoolId,
      userId: user.id,
    });
  });
}

/** Automatic fine generation / recalculation for a StudentFee */
export async function generateOrUpdateStudentFeeFineInTx(
  tx: Prisma.TransactionClient,
  studentFeeId: string,
  calcDate: Date = new Date(),
) {
  const fee = await tx.studentFee.findUnique({
    where: { id: studentFeeId },
    include: {
      fine: { include: { allocations: true } },
      student: { select: { schoolId: true } },
    },
  });
  if (!fee || !fee.dueDate) return null;

  // Find active matching rule with highest priority
  const activeRules = await tx.feeLateRule.findMany({
    where: {
      schoolId: fee.student.schoolId,
      sessionId: fee.sessionId,
      isActive: true,
      OR: [{ effectiveTill: null }, { effectiveTill: { gte: calcDate } }],
    },
    orderBy: { priority: "desc" },
  });

  if (activeRules.length === 0) return fee.fine;

  const rule = activeRules[0];
  const calculatedFineAmount = calculateFineForFee(rule, fee, calcDate);

  const existingFine = fee.fine;
  if (!existingFine) {
    if (calculatedFineAmount.lessThanOrEqualTo(0)) return null;

    // Create new StudentFeeFine
    return tx.studentFeeFine.create({
      data: {
        studentFeeId: fee.id,
        lateRuleId: rule.id,
        generatedOn: calcDate,
        calculatedAmount: calculatedFineAmount,
        waivedAmount: toDecimal(0),
        finalAmount: calculatedFineAmount,
        paidAmount: toDecimal(0),
        status: StudentFeeFineStatus.ACTIVE,
      },
    });
  }

  // Update existing fine while respecting existing waivers and payments
  const existingWaived = toDecimal(existingFine.waivedAmount);
  const existingPaid = sumDecimals(existingFine.allocations.map((a) => a.amount));

  const newFinal = calculatedFineAmount.sub(existingWaived).lessThan(0)
    ? toDecimal(0)
    : calculatedFineAmount.sub(existingWaived);

  let newStatus: StudentFeeFineStatus = StudentFeeFineStatus.ACTIVE;
  if (newFinal.lessThanOrEqualTo(existingPaid) && existingPaid.greaterThan(0)) {
    newStatus = StudentFeeFineStatus.PAID;
  } else if (newFinal.equals(0) && existingWaived.greaterThan(0)) {
    newStatus = StudentFeeFineStatus.WAIVED;
  }

  return tx.studentFeeFine.update({
    where: { id: existingFine.id },
    data: {
      lateRuleId: rule.id,
      calculatedAmount: calculatedFineAmount,
      finalAmount: newFinal,
      paidAmount: existingPaid,
      status: newStatus,
    },
  });
}

/** Transactional waiver of a StudentFeeFine */
export async function waiveStudentFineInTx(
  tx: Prisma.TransactionClient,
  opts: {
    studentFeeFineId: string;
    waiveAmount?: Prisma.Decimal | number | null;
    fullWaiver?: boolean;
    reason: string;
    remarks?: string | null;
    userId?: string | null;
  },
) {
  const fine = await tx.studentFeeFine.findUnique({
    where: { id: opts.studentFeeFineId },
    include: {
      studentFee: {
        include: { student: { select: { schoolId: true } } },
      },
      allocations: true,
    },
  });
  if (!fine) throw new Error("Student fee fine not found");

  const calcAmt = toDecimal(fine.calculatedAmount);
  const paidAmt = sumDecimals(fine.allocations.map((a) => a.amount));

  let newWaivedAmount = toDecimal(fine.waivedAmount);
  if (opts.fullWaiver) {
    newWaivedAmount = calcAmt;
  } else if (opts.waiveAmount) {
    newWaivedAmount = newWaivedAmount.add(toDecimal(opts.waiveAmount));
    if (newWaivedAmount.greaterThan(calcAmt)) {
      newWaivedAmount = calcAmt;
    }
  }

  const newFinal = calcAmt.sub(newWaivedAmount).lessThan(0) ? toDecimal(0) : calcAmt.sub(newWaivedAmount);
  let status: StudentFeeFineStatus = StudentFeeFineStatus.ACTIVE;
  if (newFinal.equals(0)) {
    status = StudentFeeFineStatus.WAIVED;
  } else if (paidAmt.greaterThanOrEqualTo(newFinal)) {
    status = StudentFeeFineStatus.PAID;
  }

  const updatedFine = await tx.studentFeeFine.update({
    where: { id: fine.id },
    data: {
      waivedAmount: newWaivedAmount,
      finalAmount: newFinal,
      status,
      waivedById: opts.userId ?? null,
      waivedAt: new Date(),
      waiveReason: opts.reason.trim(),
      remarks: opts.remarks?.trim() ?? null,
    },
  });

  if (opts.userId) {
    await writeAuditLog(
      {
        schoolId: fine.studentFee.student.schoolId,
        userId: opts.userId,
        action: "waive",
        module: "fee",
        entityType: "StudentFeeFine",
        entityId: fine.id,
        newValue: {
          waivedAmount: decimalToNumber(newWaivedAmount),
          finalAmount: decimalToNumber(newFinal),
          reason: opts.reason,
        },
      },
      tx,
    );
  }

  return updatedFine;
}

/** Public entrypoint to waive a fine */
export async function waiveStudentFine(input: WaiveStudentFineInput) {
  const { user } = await requirePermission("fee.update");
  const data = parseOrThrow(waiveStudentFineSchema, input);

  return prisma.$transaction(async (tx) => {
    return waiveStudentFineInTx(tx, {
      ...data,
      userId: user.id,
    });
  });
}

/** List fee late rules */
export async function listFeeLateRules(input?: ListFeeLateRulesInput) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listFeeLateRulesSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.feeLateRule.findMany({
      where,
      include: {
        session: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.feeLateRule.count({ where }),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      name: r.name,
      sessionId: r.sessionId,
      sessionName: r.session.name,
      isActive: r.isActive,
      graceDays: r.graceDays,
      calculationType: r.calculationType,
      fixedAmount: r.fixedAmount ? decimalToNumber(r.fixedAmount) : null,
      percentage: r.percentage ? decimalToNumber(r.percentage) : null,
      applyPerDay: r.applyPerDay ? decimalToNumber(r.applyPerDay) : null,
      applyPerMonth: r.applyPerMonth ? decimalToNumber(r.applyPerMonth) : null,
      maxFine: r.maxFine ? decimalToNumber(r.maxFine) : null,
      applicableFeeHeadIds: r.applicableFeeHeads ? JSON.parse(r.applicableFeeHeads) : null,
      priority: r.priority,
      createdBy: r.createdBy ? { id: r.createdBy.id, name: r.createdBy.name } : null,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

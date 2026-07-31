import { AdvanceTransactionType, Prisma } from "@prisma/client";
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
  listWalletTransactionsSchema,
  recordWalletTransactionSchema,
  type ListWalletTransactionsInput,
  type RecordWalletTransactionInput,
} from "@/server/validators/wallet.validator";

/** Credit transaction types that increase wallet balance */
const CREDIT_TRANSACTION_TYPES = new Set<AdvanceTransactionType>([
  AdvanceTransactionType.CREDIT_FROM_PAYMENT,
  AdvanceTransactionType.CREDIT_NOTE_ADJUSTMENT,
]);

/**
 * Transactionally retrieve or create a FamilyAdvanceWallet.
 * Idempotent: Exactly 1 wallet per family.
 */
export async function getOrCreateFamilyWalletInTx(
  tx: Prisma.TransactionClient,
  familyId: string,
) {
  const family = await tx.family.findUnique({
    where: { id: familyId },
    select: { id: true, schoolId: true },
  });
  if (!family) {
    throw new Error("Family not found");
  }

  let wallet = await tx.familyAdvanceWallet.findUnique({
    where: { familyId },
  });

  if (!wallet) {
    wallet = await tx.familyAdvanceWallet.create({
      data: {
        familyId,
        balance: toDecimal(0),
      },
    });
  }

  return wallet;
}

/**
 * Record a transaction on a FamilyAdvanceWallet.
 * Strictly enforces Accounting Invariants:
 * 1. Balance never becomes negative.
 * 2. Every balance modification creates exactly 1 immutable AdvanceTransaction.
 * 3. balanceAfter = balanceBefore +/- amount.
 * 4. Atomic transaction safety.
 */
export async function recordWalletTransactionInTx(
  tx: Prisma.TransactionClient,
  opts: {
    familyId: string;
    type: AdvanceTransactionType;
    amount: Prisma.Decimal | number;
    reason: string;
    remarks?: string | null;
    paymentId?: string | null;
    targetStudentId?: string | null;
    targetStudentFeeId?: string | null;
    userId?: string | null;
  },
) {
  const amountDecimal = toDecimal(opts.amount);
  if (amountDecimal.lessThanOrEqualTo(0)) {
    throw new Error("Transaction amount must be greater than zero");
  }

  if (!opts.reason || !opts.reason.trim()) {
    throw new Error("Transaction reason is required");
  }

  // Get or initialize wallet
  const wallet = await getOrCreateFamilyWalletInTx(tx, opts.familyId);
  const balanceBefore = toDecimal(wallet.balance);

  const isCredit = CREDIT_TRANSACTION_TYPES.has(opts.type);
  const balanceAfter = isCredit
    ? balanceBefore.add(amountDecimal)
    : balanceBefore.sub(amountDecimal);

  // Invariant 1 Check: Wallet balance must never be negative
  if (balanceAfter.lessThan(0)) {
    throw new Error(
      `Insufficient wallet balance. Current balance: ${decimalToNumber(balanceBefore)}, Requested debit: ${decimalToNumber(amountDecimal)}`,
    );
  }

  // Update wallet balance
  const updatedWallet = await tx.familyAdvanceWallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter },
  });

  // Create immutable transaction record
  const transaction = await tx.advanceTransaction.create({
    data: {
      walletId: wallet.id,
      familyId: opts.familyId,
      paymentId: opts.paymentId ?? null,
      targetStudentId: opts.targetStudentId ?? null,
      targetStudentFeeId: opts.targetStudentFeeId ?? null,
      type: opts.type,
      amount: amountDecimal,
      balanceBefore,
      balanceAfter,
      reason: opts.reason.trim(),
      remarks: opts.remarks?.trim() ?? null,
      recordedById: opts.userId ?? null,
    },
  });

  if (opts.userId) {
    await writeAuditLog(
      {
        schoolId: (await tx.family.findUnique({ where: { id: opts.familyId }, select: { schoolId: true } }))?.schoolId,
        userId: opts.userId,
        action: isCredit ? "wallet_credit" : "wallet_debit",
        module: "fee",
        entityType: "FamilyAdvanceWallet",
        entityId: wallet.id,
        newValue: {
          transactionId: transaction.id,
          type: opts.type,
          amount: decimalToNumber(amountDecimal),
          balanceBefore: decimalToNumber(balanceBefore),
          balanceAfter: decimalToNumber(balanceAfter),
        },
      },
      tx,
    );
  }

  return { wallet: updatedWallet, transaction };
}

/** Explicit service entrypoint to record a wallet transaction outside an active transaction */
export async function recordWalletTransaction(input: RecordWalletTransactionInput) {
  const { user } = await requirePermission("payment.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(recordWalletTransactionSchema, input);

  const family = await prisma.family.findFirst({
    where: { id: data.familyId, schoolId },
  });
  if (!family) throw new Error("Family not found");

  return prisma.$transaction(async (tx) => {
    return recordWalletTransactionInTx(tx, {
      ...data,
      userId: user.id,
    });
  });
}

/** Get wallet summary for a family */
export async function getFamilyWallet(familyId: string) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  const family = await prisma.family.findFirst({
    where: { id: familyId, schoolId },
    select: { id: true, familyCode: true, fatherName: true, motherName: true },
  });
  if (!family) throw new Error("Family not found");

  const wallet = await prisma.familyAdvanceWallet.findUnique({
    where: { familyId },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          recordedBy: { select: { id: true, name: true } },
          targetStudent: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  if (!wallet) {
    return {
      familyId,
      balance: 0,
      transactions: [],
    };
  }

  return {
    id: wallet.id,
    familyId: wallet.familyId,
    balance: decimalToNumber(wallet.balance),
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    transactions: wallet.transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: decimalToNumber(t.amount),
      balanceBefore: decimalToNumber(t.balanceBefore),
      balanceAfter: decimalToNumber(t.balanceAfter),
      reason: t.reason,
      remarks: t.remarks,
      createdAt: t.createdAt,
      recordedBy: t.recordedBy ? { id: t.recordedBy.id, name: t.recordedBy.name } : null,
      targetStudent: t.targetStudent ? { id: t.targetStudent.id, fullName: t.targetStudent.fullName } : null,
    })),
  };
}

/** Query wallet balance (returns 0 if wallet does not exist yet) */
export async function getFamilyWalletBalance(familyId: string): Promise<number> {
  const wallet = await prisma.familyAdvanceWallet.findUnique({
    where: { familyId },
    select: { balance: true },
  });
  return wallet ? decimalToNumber(wallet.balance) : 0;
}

/** Paginated audit transaction history for a family wallet */
export async function listAdvanceTransactions(input: ListWalletTransactionsInput) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listWalletTransactionsSchema, input);
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const family = await prisma.family.findFirst({
    where: { id: params.familyId, schoolId },
  });
  if (!family) throw new Error("Family not found");

  const [items, total] = await Promise.all([
    prisma.advanceTransaction.findMany({
      where: { familyId: params.familyId },
      include: {
        recordedBy: { select: { id: true, name: true } },
        targetStudent: { select: { id: true, fullName: true, admissionNo: true } },
        payment: { select: { id: true, receiptNo: true, amount: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.advanceTransaction.count({
      where: { familyId: params.familyId },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
  };
}

/**
 * Transactional Family Advance Reconciliation Engine (Phase 2).
 * Consumes available FamilyAdvanceWallet balance against eligible unpaid StudentFee records
 * for ACTIVE students in the family using strict FIFO ordering.
 * 
 * Order Rules:
 * 1. Previous session arrears first (session.startDate ASC)
 * 2. Oldest due date next (dueDate ASC)
 * 3. Deterministic creation order (createdAt ASC, id ASC)
 * 
 * Conservative Auto-Reconciliation Rule (Part 5):
 * Auto-reconciliation only settles fees whose dueDate is <= 30 days from now (or past due / legacy).
 * Does not prematurely absorb wallet for far-future months unless explicitly requested.
 */
export async function reconcileFamilyAdvanceInTx(
  tx: Prisma.TransactionClient,
  opts: {
    schoolId: string;
    familyId: string;
    userId?: string | null;
  },
): Promise<{ settledCount: number; amountSettled: Prisma.Decimal }> {
  // 1. Get FamilyAdvanceWallet
  const wallet = await tx.familyAdvanceWallet.findUnique({
    where: { familyId: opts.familyId },
  });

  if (!wallet || toDecimal(wallet.balance).lessThanOrEqualTo(0)) {
    return { settledCount: 0, amountSettled: toDecimal(0) };
  }

  let availableWallet = toDecimal(wallet.balance);

  // 2. Fetch ACTIVE students in this family (Part 9: Exited students receive no auto-reconciliation)
  const activeStudents = await tx.student.findMany({
    where: { familyId: opts.familyId, schoolId: opts.schoolId, status: "ACTIVE" },
    select: { id: true },
  });

  if (activeStudents.length === 0) {
    return { settledCount: 0, amountSettled: toDecimal(0) };
  }

  const activeStudentIds = activeStudents.map((s) => s.id);

  // 3. Query eligible unpaid StudentFee records
  const unpaidFees = await tx.studentFee.findMany({
    where: {
      studentId: { in: activeStudentIds },
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    include: {
      allocations: true,
      feeHead: true,
      session: true,
    },
    orderBy: [
      { session: { startDate: "asc" } },
      { dueDate: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });

  // Conservative auto-reconciliation threshold: 30 days ahead
  const cutoffDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  let totalSettled = toDecimal(0);
  let settledCount = 0;

  for (const fee of unpaidFees) {
    if (availableWallet.lessThanOrEqualTo(0)) break;

    // Part 5 Eligibility Check: Skip future month fees that are not due yet
    if (fee.dueDate && fee.dueDate > cutoffDate) {
      continue;
    }

    const alreadyPaid = sumDecimals(fee.allocations.map((a) => a.amount));
    const netDue = toDecimal(fee.amount).sub(alreadyPaid);
    if (netDue.lessThanOrEqualTo(0)) continue;

    const applyAmount = availableWallet.lessThanOrEqualTo(netDue)
      ? availableWallet
      : netDue;

    // Record FeePaymentAllocation (paymentId: null -> Advance settlement source)
    await tx.feePaymentAllocation.create({
      data: {
        paymentId: null,
        studentId: fee.studentId,
        studentFeeId: fee.id,
        amount: applyAmount,
      },
    });

    // Record wallet debit transaction (AdvanceTransaction)
    const { wallet: newWallet } = await recordWalletTransactionInTx(tx, {
      familyId: opts.familyId,
      type: AdvanceTransactionType.DEBIT_FEE_SETTLEMENT,
      amount: applyAmount,
      targetStudentId: fee.studentId,
      targetStudentFeeId: fee.id,
      reason: `Advance wallet settlement for ${fee.feeHead.name}`,
      userId: opts.userId,
    });

    availableWallet = toDecimal(newWallet.balance);
    totalSettled = totalSettled.add(applyAmount);
    settledCount++;

    // Recalculate StudentFee status dynamically
    const { recalcStudentFeeStatus } = await import("@/server/services/fee.service");
    await recalcStudentFeeStatus(tx, fee.id);
  }

  return { settledCount, amountSettled: totalSettled };
}

/** Public entrypoint to run advance reconciliation for a family */
export async function reconcileFamilyAdvance(familyId: string) {
  const { user } = await requirePermission("payment.create");
  const schoolId = schoolIdFromUser(user);

  const family = await prisma.family.findFirst({
    where: { id: familyId, schoolId },
  });
  if (!family) throw new Error("Family not found");

  return prisma.$transaction(async (tx) => {
    return reconcileFamilyAdvanceInTx(tx, {
      schoolId,
      familyId,
      userId: user.id,
    });
  });
}

/** Refund workflow for Family Advance Wallet (Part 7) */
export async function refundFamilyAdvance(input: {
  familyId: string;
  amount: Prisma.Decimal | number;
  reason: string;
  remarks?: string | null;
}) {
  const { user } = await requirePermission("payment.create");
  const schoolId = schoolIdFromUser(user);

  const family = await prisma.family.findFirst({
    where: { id: input.familyId, schoolId },
  });
  if (!family) throw new Error("Family not found");

  const amountDecimal = toDecimal(input.amount);
  if (amountDecimal.lessThanOrEqualTo(0)) {
    throw new Error("Refund amount must be greater than zero");
  }

  if (!input.reason || !input.reason.trim()) {
    throw new Error("Refund reason is required");
  }

  return prisma.$transaction(async (tx) => {
    return recordWalletTransactionInTx(tx, {
      familyId: input.familyId,
      type: AdvanceTransactionType.MANUAL_REFUND,
      amount: amountDecimal,
      reason: input.reason.trim(),
      remarks: input.remarks ?? null,
      userId: user.id,
    });
  });
}

/** Manual Wallet Adjustment workflow for Principal/Admin (Part 8) */
export async function manualWalletAdjustment(input: {
  familyId: string;
  type: AdvanceTransactionType;
  amount: Prisma.Decimal | number;
  reason: string;
  remarks?: string | null;
}) {
  const { user } = await requirePermission("fee.update");
  const schoolId = schoolIdFromUser(user);

  if (
    input.type !== AdvanceTransactionType.CREDIT_NOTE_ADJUSTMENT &&
    input.type !== AdvanceTransactionType.MANUAL_ADJUSTMENT
  ) {
    throw new Error("Invalid transaction type for manual adjustment");
  }

  const family = await prisma.family.findFirst({
    where: { id: input.familyId, schoolId },
  });
  if (!family) throw new Error("Family not found");

  const amountDecimal = toDecimal(input.amount);
  if (amountDecimal.lessThanOrEqualTo(0)) {
    throw new Error("Adjustment amount must be greater than zero");
  }

  if (!input.reason || !input.reason.trim()) {
    throw new Error("Adjustment reason is required");
  }

  return prisma.$transaction(async (tx) => {
    return recordWalletTransactionInTx(tx, {
      familyId: input.familyId,
      type: input.type,
      amount: amountDecimal,
      reason: input.reason.trim(),
      remarks: input.remarks ?? null,
      userId: user.id,
    });
  });
}

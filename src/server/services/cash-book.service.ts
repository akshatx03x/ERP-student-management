import { CashBookEntryType, Prisma } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { decimalToNumber, parsePagination, schoolIdFromUser, toDecimal } from "@/server/lib/helpers";
import { writeAuditLog } from "@/server/services/audit.service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AddCashBookEntryInput {
  date?: Date;
  entryType: CashBookEntryType;
  amount: number;
  description: string;
  remarks?: string | null;
  voucherNo?: string | null;
}

export interface ListCashBookEntriesInput {
  page?: number;
  pageSize?: number;
  startDate?: Date;
  endDate?: Date;
  entryType?: CashBookEntryType;
  includeVoided?: boolean;
}

export interface VoidCashBookEntryInput {
  entryId: string;
  voidReason: string;
}

// ── Human-readable labels ─────────────────────────────────────────────────────

export const CASH_BOOK_ENTRY_LABELS: Record<CashBookEntryType, string> = {
  MISC_INCOME: "Misc Income",
  MISC_EXPENSE: "Misc Expense",
  PETTY_CASH: "Petty Cash",
  ELECTRICITY_BILL: "Electricity Bill",
  STATIONERY: "Stationery",
  MAINTENANCE: "Maintenance",
  SALARY_ADVANCE: "Salary Advance",
  OTHER_EXPENSE: "Other Expense",
  OTHER_INCOME: "Other Income",
};

// Income types (Credit) vs Expense types (Debit)
export const CREDIT_ENTRY_TYPES = new Set<CashBookEntryType>([
  CashBookEntryType.MISC_INCOME,
  CashBookEntryType.OTHER_INCOME,
]);

export function isCashBookCredit(type: CashBookEntryType): boolean {
  return CREDIT_ENTRY_TYPES.has(type);
}

// ── 1. ADD CASH BOOK ENTRY ────────────────────────────────────────────────────

/**
 * Permanently store a miscellaneous income or expense entry.
 * Entries are NEVER deleted. Use voidCashBookEntry() to cancel.
 */
export async function addCashBookEntry(input: AddCashBookEntryInput) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  const amountDecimal = toDecimal(input.amount);
  if (amountDecimal.lessThanOrEqualTo(0)) {
    throw new Error("Amount must be greater than zero");
  }
  if (!input.description?.trim()) {
    throw new Error("Description is required");
  }

  const entry = await prisma.cashBookEntry.create({
    data: {
      schoolId,
      date: input.date ?? new Date(),
      entryType: input.entryType,
      amount: amountDecimal,
      description: input.description.trim(),
      remarks: input.remarks?.trim() ?? null,
      voucherNo: input.voucherNo?.trim() ?? null,
      recordedById: user.id,
    },
  });

  await writeAuditLog({
    schoolId,
    userId: user.id,
    action: "create",
    module: "cash_book",
    entityType: "CashBookEntry",
    entityId: entry.id,
    newValue: {
      entryType: entry.entryType,
      amount: decimalToNumber(entry.amount),
      description: entry.description,
    },
  });

  return { ...entry, amount: decimalToNumber(entry.amount) };
}

// ── 2. LIST CASH BOOK ENTRIES ─────────────────────────────────────────────────

export async function listCashBookEntries(input: ListCashBookEntriesInput = {}) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  const { skip, take, page, pageSize } = parsePagination(input.page, input.pageSize ?? 20);

  const where: Prisma.CashBookEntryWhereInput = {
    schoolId,
    ...(input.startDate || input.endDate
      ? {
          date: {
            ...(input.startDate ? { gte: input.startDate } : {}),
            ...(input.endDate ? { lte: input.endDate } : {}),
          },
        }
      : {}),
    ...(input.entryType ? { entryType: input.entryType } : {}),
    // By default hide voided entries unless explicitly requested
    ...(!input.includeVoided ? { isVoided: false } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.cashBookEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      include: {
        recordedBy: { select: { id: true, name: true } },
        voidedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.cashBookEntry.count({ where }),
  ]);

  return {
    items: items.map((e) => ({
      id: e.id,
      date: e.date,
      createdAt: e.createdAt,
      entryType: e.entryType,
      entryLabel: CASH_BOOK_ENTRY_LABELS[e.entryType],
      isCredit: isCashBookCredit(e.entryType),
      amount: decimalToNumber(e.amount),
      description: e.description,
      remarks: e.remarks,
      voucherNo: e.voucherNo,
      isVoided: e.isVoided,
      voidedAt: e.voidedAt,
      voidReason: e.voidReason,
      recordedBy: e.recordedBy,
      voidedBy: e.voidedBy,
    })),
    total,
    page,
    pageSize,
  };
}

// ── 3. VOID CASH BOOK ENTRY ───────────────────────────────────────────────────

/**
 * Void a Cash Book entry.
 * The entry is NEVER deleted — it is flagged as voided with full audit trail:
 * - voidedAt: timestamp of the action
 * - voidedById: user who performed the void
 * - voidReason: mandatory reason string
 *
 * Voided entries are excluded from all balance calculations but remain
 * permanently visible in the audit trail when includeVoided=true.
 */
export async function voidCashBookEntry(input: VoidCashBookEntryInput) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  if (!input.voidReason?.trim()) {
    throw new Error("Void reason is required");
  }

  const existing = await prisma.cashBookEntry.findFirst({
    where: { id: input.entryId, schoolId },
  });
  if (!existing) throw new Error("Cash book entry not found");
  if (existing.isVoided) throw new Error("Entry is already voided");

  const updated = await prisma.cashBookEntry.update({
    where: { id: input.entryId },
    data: {
      isVoided: true,
      voidedAt: new Date(),
      voidedById: user.id,
      voidReason: input.voidReason.trim(),
    },
    include: {
      recordedBy: { select: { id: true, name: true } },
      voidedBy: { select: { id: true, name: true } },
    },
  });

  await writeAuditLog({
    schoolId,
    userId: user.id,
    action: "void",
    module: "cash_book",
    entityType: "CashBookEntry",
    entityId: updated.id,
    oldValue: {
      entryType: existing.entryType,
      amount: decimalToNumber(existing.amount),
      description: existing.description,
      isVoided: false,
    },
    newValue: {
      isVoided: true,
      voidReason: input.voidReason.trim(),
      voidedAt: updated.voidedAt,
    },
  });

  return { ...updated, amount: decimalToNumber(updated.amount) };
}

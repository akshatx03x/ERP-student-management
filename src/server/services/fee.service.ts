import { AdvanceTransactionType, FeeFrequency, FeeMonth, PaymentMethod, Prisma, Role, StudentFeeStatus } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { getBrandingBySchoolId } from "@/server/services/branding.service";
import {
  decimalToNumber,
  getNextSequenceValue,
  parsePagination,
  schoolIdFromUser,
  sumDecimals,
  toDecimal,
} from "@/server/lib/helpers";
import { formatCurrency, formatDate } from "@/lib/utils";
import { parseOrThrow } from "@/server/validators/common";
import {
  createFeeHeadSchema,
  createFeeStructureSchema,
  generateMonthlyLedgerSchema,
  listPaymentsSchema,
  listStudentFeesSchema,
  recordPaymentSchema,
  updateFeeHeadSchema,
  updateFeeStructureSchema,
  type CreateFeeHeadInput,
  type CreateFeeStructureInput,
  type GenerateMonthlyLedgerInput,
  type RecordPaymentInput,
  type UpdateFeeStructureInput,
} from "@/server/validators/fee.validator";

export const ALL_FEE_MONTHS: FeeMonth[] = [
  FeeMonth.APRIL,
  FeeMonth.MAY,
  FeeMonth.JUNE,
  FeeMonth.JULY,
  FeeMonth.AUGUST,
  FeeMonth.SEPTEMBER,
  FeeMonth.OCTOBER,
  FeeMonth.NOVEMBER,
  FeeMonth.DECEMBER,
  FeeMonth.JANUARY,
  FeeMonth.FEBRUARY,
  FeeMonth.MARCH,
];

export function getAcademicMonthIndex(month: FeeMonth): number {
  return ALL_FEE_MONTHS.indexOf(month);
}

export function dateToFeeMonth(date: Date): FeeMonth {
  const m = date.getMonth(); // 0..11
  switch (m) {
    case 0:
      return FeeMonth.JANUARY;
    case 1:
      return FeeMonth.FEBRUARY;
    case 2:
      return FeeMonth.MARCH;
    case 3:
      return FeeMonth.APRIL;
    case 4:
      return FeeMonth.MAY;
    case 5:
      return FeeMonth.JUNE;
    case 6:
      return FeeMonth.JULY;
    case 7:
      return FeeMonth.AUGUST;
    case 8:
      return FeeMonth.SEPTEMBER;
    case 9:
      return FeeMonth.OCTOBER;
    case 10:
      return FeeMonth.NOVEMBER;
    case 11:
      return FeeMonth.DECEMBER;
    default:
      return FeeMonth.APRIL;
  }
}

export function computeMonthDueDate(
  sessionStartDate: Date,
  month: FeeMonth,
  dayOfMonth = 10,
): { dueDate: Date; dueYear: number } {
  const sessionYear = sessionStartDate.getFullYear();
  const academicIdx = getAcademicMonthIndex(month);
  let calendarMonthIndex: number;
  let year: number;

  if (academicIdx <= 8) {
    calendarMonthIndex = academicIdx + 3; // 3..11
    year = sessionYear;
  } else {
    calendarMonthIndex = academicIdx - 9; // 0..2
    year = sessionYear + 1;
  }

  const dueDate = new Date(year, calendarMonthIndex, dayOfMonth, 23, 59, 59, 999);
  return { dueDate, dueYear: year };
}

export function getApplicableMonthsForItem(item: {
  months?: Array<{ month: FeeMonth }> | null;
  feeHead: { frequency: FeeFrequency };
}): FeeMonth[] {
  if (item.months && item.months.length > 0) {
    return item.months.map((m) => m.month);
  }

  switch (item.feeHead.frequency) {
    case FeeFrequency.MONTHLY:
      return ALL_FEE_MONTHS;
    case FeeFrequency.ANNUAL:
    case FeeFrequency.ONE_TIME:
      return [FeeMonth.APRIL];
    case FeeFrequency.QUARTERLY:
      return [FeeMonth.APRIL, FeeMonth.JULY, FeeMonth.OCTOBER, FeeMonth.JANUARY];
    case FeeFrequency.CUSTOM:
    default:
      return [FeeMonth.APRIL];
  }
}

export async function recalcStudentFeeStatus(
  tx: Prisma.TransactionClient,
  studentFeeId: string,
) {
  const fee = await tx.studentFee.findUnique({
    where: { id: studentFeeId },
    include: { allocations: true, fine: true },
  });
  if (!fee) return;

  const paid = sumDecimals(fee.allocations.map((a) => a.amount));
  const fineAmount = fee.fine ? toDecimal(fee.fine.finalAmount) : toDecimal(0);
  const total = toDecimal(fee.amount).sub(toDecimal(fee.discountAmount ?? 0)).add(fineAmount);
  const netTotal = total.lessThan(0) ? toDecimal(0) : total;
  let status: StudentFeeStatus = StudentFeeStatus.PENDING;

  if (paid.greaterThanOrEqualTo(netTotal)) {
    status = StudentFeeStatus.PAID;
  } else if (paid.greaterThan(0)) {
    status = StudentFeeStatus.PARTIAL;
  } else if (fee.dueDate && fee.dueDate < new Date()) {
    status = StudentFeeStatus.OVERDUE;
  }

  await tx.studentFee.update({
    where: { id: studentFeeId },
    data: { status },
  });
}

export async function generateReceiptNoInTx(
  tx: Prisma.TransactionClient,
  schoolId: string,
) {
  const year = new Date().getFullYear();
  const school = await tx.school.findUnique({ where: { id: schoolId }, select: { code: true } });
  const schoolCode = school?.code ? school.code.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase() : "SCH";
  const schoolHash = schoolId.slice(-4).toUpperCase();
  const prefix = `RCP-${schoolCode}-${schoolHash}-${year}`;
  const counterId = `receipt_no:${schoolId}:${year}`;
  const seqValue = await getNextSequenceValue(tx, counterId);
  return `${prefix}-${String(seqValue).padStart(5, "0")}`;
}

/** Find the single fee structure for a class in a session. */
export async function findFeeStructureForClass(
  tx: Prisma.TransactionClient | typeof prisma,
  sessionId: string,
  classId: string,
) {
  return tx.feeStructure.findFirst({
    where: { sessionId, classId },
    select: {
      id: true,
      name: true,
      items: {
        select: {
          id: true,
          feeHeadId: true,
          amount: true,
          months: {
            select: {
              month: true,
            },
          },
          feeHead: {
            select: {
              id: true,
              name: true,
              frequency: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Monthly Ledger Generator Service (Phase 1).
 * Reads Fee Structure & FeeStructureItemMonth to generate month-wise StudentFee rows.
 * Validates active student, active session, and enforces idempotency.
 */
export async function generateStudentMonthlyLedgerInTx(
  tx: Prisma.TransactionClient,
  opts: {
    schoolId: string;
    studentId: string;
    sessionId: string;
    classId: string;
    userId?: string | null;
    requireStructure?: boolean;
  },
): Promise<{ generated: number; structureId: string | null }> {
  // 1. Validate active student
  const student = await tx.student.findFirst({
    where: { id: opts.studentId, schoolId: opts.schoolId },
    select: { id: true, status: true, admissionDate: true },
  });
  if (!student) {
    throw new Error("Student not found");
  }
  if (student.status !== "ACTIVE") {
    throw new Error(`Cannot generate fee ledger for ${student.status.toLowerCase()} student`);
  }

  // 2. Validate academic session
  const session = await tx.academicSession.findFirst({
    where: { id: opts.sessionId, schoolId: opts.schoolId },
    select: { id: true, startDate: true, endDate: true, status: true },
  });
  if (!session) {
    throw new Error("Invalid academic session");
  }

  // 3. Find fee structure
  const structure = await findFeeStructureForClass(tx, opts.sessionId, opts.classId);
  if (!structure) {
    if (opts.requireStructure) {
      throw new Error(
        "No fee structure exists for this class in the selected academic session. Create a fee structure before generating fees.",
      );
    }
    return { generated: 0, structureId: null };
  }

  // 5. Query existing StudentFee rows for idempotency
  const existingFees = await tx.studentFee.findMany({
    where: { studentId: opts.studentId, sessionId: opts.sessionId },
    select: { feeHeadId: true, month: true },
  });
  const existingSet = new Set<string>();
  for (const f of existingFees) {
    existingSet.add(`${f.feeHeadId}:${f.month ?? "LEGACY"}`);
  }

  // 6. Build new StudentFee records
  const newItems: Array<{
    studentId: string;
    feeHeadId: string;
    sessionId: string;
    amount: Prisma.Decimal;
    month: FeeMonth;
    dueYear: number;
    dueDate: Date;
    status: StudentFeeStatus;
    remarks: string;
  }> = [];

  for (const item of structure.items) {
    const applicableMonths = getApplicableMonthsForItem(item);
    for (const month of applicableMonths) {

      const key = `${item.feeHeadId}:${month}`;
      if (existingSet.has(key)) {
        continue; // Idempotency: skip already generated rows
      }

      const { dueDate, dueYear } = computeMonthDueDate(session.startDate, month);

      newItems.push({
        studentId: opts.studentId,
        feeHeadId: item.feeHeadId,
        sessionId: opts.sessionId,
        amount: item.amount,
        month,
        dueYear,
        dueDate,
        status: StudentFeeStatus.PENDING,
        remarks: `Auto-generated for ${month} from ${structure.name}`,
      });
      existingSet.add(key);
    }
  }

  if (newItems.length > 0) {
    await tx.studentFee.createMany({ data: newItems });

    await writeAuditLog(
      {
        schoolId: opts.schoolId,
        userId: opts.userId,
        action: "create",
        module: "fee",
        entityType: "StudentFee",
        entityId: opts.studentId,
        newValue: {
          structureId: structure.id,
          generated: newItems.length,
          sessionId: opts.sessionId,
          classId: opts.classId,
        },
      },
      tx,
    );
  }

  return { generated: newItems.length, structureId: structure.id };
}

/**
 * Attach fee structure to student (Delegates to Monthly Ledger Generator).
 * Fully backward compatible.
 */
export async function attachFeeStructureInTx(
  tx: Prisma.TransactionClient,
  opts: {
    schoolId: string;
    studentId: string;
    sessionId: string;
    classId: string;
    userId?: string | null;
    requireStructure?: boolean;
  },
): Promise<{ attached: number; structureId: string | null }> {
  const result = await generateStudentMonthlyLedgerInTx(tx, opts);
  return { attached: result.generated, structureId: result.structureId };
}


/** Distribute an amount across unpaid student fees (FIFO by due date). */
async function expandAllocationToFees(
  tx: Prisma.TransactionClient,
  studentId: string,
  amount: Prisma.Decimal,
  explicitFeeId?: string | null,
): Promise<Array<{ studentId: string; studentFeeId: string | null; amount: Prisma.Decimal }>> {
  if (explicitFeeId) {
    return [{ studentId, studentFeeId: explicitFeeId, amount }];
  }

  const unpaid = await tx.studentFee.findMany({
    where: {
      studentId,
      status: { in: [StudentFeeStatus.PENDING, StudentFeeStatus.PARTIAL, StudentFeeStatus.OVERDUE] },
    },
    include: { allocations: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const rows: Array<{ studentId: string; studentFeeId: string | null; amount: Prisma.Decimal }> = [];
  let remaining = amount;

  for (const fee of unpaid) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const alreadyPaid = sumDecimals(fee.allocations.map((a) => a.amount));
    const netBillable = toDecimal(fee.amount).sub(toDecimal(fee.discountAmount ?? 0));
    const balance = netBillable.sub(alreadyPaid);
    if (balance.lessThanOrEqualTo(0)) continue;

    const apply = remaining.lessThanOrEqualTo(balance) ? remaining : balance;
    rows.push({ studentId, studentFeeId: fee.id, amount: apply });
    remaining = remaining.sub(apply);
  }

  if (remaining.greaterThan(0)) {
    rows.push({ studentId, studentFeeId: null, amount: remaining });
  }

  return rows.length > 0 ? rows : [{ studentId, studentFeeId: null, amount }];
}

function ledgerFromFees(
  fees: Array<{
    id: string;
    amount: Prisma.Decimal | number;
    discountAmount?: Prisma.Decimal | number | null;
    status: StudentFeeStatus;
    remarks: string | null;
    dueDate: Date | null;
    feeHead: { id: string; name: string };
    session: { id: string; name: string };
    allocations: Array<{ amount: Prisma.Decimal | number; studentFeeFineId?: string | null }>;
    fine?: {
      id: string;
      calculatedAmount: Prisma.Decimal | number;
      waivedAmount: Prisma.Decimal | number;
      finalAmount: Prisma.Decimal | number;
      paidAmount: Prisma.Decimal | number;
      status: string;
    } | null;
  }>,
) {
  const lines = fees.map((f) => {
    const origAmount = decimalToNumber(f.amount);
    const discAmount = f.discountAmount ? decimalToNumber(f.discountAmount) : 0;
    const netAmount = Math.max(0, origAmount - discAmount);

    const calcFine = f.fine ? decimalToNumber(f.fine.calculatedAmount) : 0;
    const waivedFine = f.fine ? decimalToNumber(f.fine.waivedAmount) : 0;
    const finalFine = f.fine ? decimalToNumber(f.fine.finalAmount) : 0;

    const totalNetDue = netAmount + finalFine;
    const paidAmount = decimalToNumber(sumDecimals(f.allocations.map((a) => a.amount)));

    return {
      id: f.id,
      feeHead: f.feeHead,
      session: f.session,
      amount: totalNetDue,
      originalAmount: origAmount,
      discountAmount: discAmount,
      calculatedFine: calcFine,
      waivedFine: waivedFine,
      finalFine: finalFine,
      paidAmount,
      remaining: Math.max(0, totalNetDue - paidAmount),
      status: f.status,
      dueDate: f.dueDate,
      remarks: f.remarks,
    };
  });

  const totalFee = lines.reduce((s, l) => s + l.amount, 0);
  const paid = lines.reduce((s, l) => s + l.paidAmount, 0);
  const remaining = Math.max(0, totalFee - paid);

  return { lines, totalFee, paid, remaining };
}

// ── Fee Heads ──

export async function listFeeHeads(activeOnly = false) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  return prisma.feeHead.findMany({
    where: { schoolId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function createFeeHead(input: CreateFeeHeadInput) {
  const { user } = await requirePermission("fee.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createFeeHeadSchema, input);

  const dup = await prisma.feeHead.findUnique({
    where: { schoolId_name: { schoolId, name: data.name } },
  });
  if (dup) throw new Error(`Fee head "${data.name}" already exists`);

  return prisma.$transaction(async (tx) => {
    const head = await tx.feeHead.create({ data: { schoolId, ...data } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "fee",
        entityType: "FeeHead",
        entityId: head.id,
        newValue: head,
      },
      tx,
    );
    return head;
  });
}

export async function updateFeeHead(input: { id: string } & Partial<CreateFeeHeadInput>) {
  const { user } = await requirePermission("fee.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateFeeHeadSchema, input);

  const existing = await prisma.feeHead.findFirst({
    where: { id: data.id, schoolId },
  });
  if (!existing) throw new Error("Fee head not found");

  const { id, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.feeHead.update({ where: { id }, data: rest });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "fee",
        entityType: "FeeHead",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

// ── Fee Structures ──

export async function listFeeStructures(sessionId?: string, classId?: string) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  const structures = await prisma.feeStructure.findMany({
    where: {
      ...(sessionId ? { sessionId } : { session: { schoolId } }),
      ...(classId ? { classId } : {}),
    },
    include: {
      class: true,
      session: true,
      items: { include: { feeHead: true, months: true }, orderBy: { feeHead: { name: "asc" } } },
    },
    orderBy: [{ session: { startDate: "desc" } }, { class: { sortOrder: "asc" } }],
  });

  return structures.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    sessionId: s.sessionId,
    classId: s.classId,
    name: s.name,
    class: {
      id: s.class.id,
      name: s.class.name,
    },
    session: {
      id: s.session.id,
      name: s.session.name,
    },
    totalAnnualFee: s.items.reduce((sum, item) => sum + decimalToNumber(item.amount), 0),
    items: s.items.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      feeStructureId: item.feeStructureId,
      feeHeadId: item.feeHeadId,
      amount: decimalToNumber(item.amount),
      feeHead: {
        id: item.feeHead.id,
        name: item.feeHead.name,
      },
      months: item.months.map((m) => m.month),
    })),
  }));
}

export async function createFeeStructure(input: CreateFeeStructureInput) {
  const { user } = await requirePermission("fee.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createFeeStructureSchema, input);

  const [session, cls] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.class.findFirst({ where: { id: data.classId, schoolId } }),
  ]);
  if (!session || !cls) throw new Error("Invalid session or class");

  const existing = await prisma.feeStructure.findFirst({
    where: { sessionId: data.sessionId, classId: data.classId },
  });
  if (existing) {
    throw new Error(
      `Class "${cls.name}" already has a fee structure for session "${session.name}". Update the existing structure instead.`,
    );
  }

  const headIds = data.items.map((i) => i.feeHeadId);
  if (new Set(headIds).size !== headIds.length) {
    throw new Error("Each fee head can only appear once in a fee structure");
  }

  const name = data.name?.trim() || `${cls.name} Fee Structure`;

  return prisma.$transaction(async (tx) => {
    const structure = await tx.feeStructure.create({
      data: {
        sessionId: data.sessionId,
        classId: data.classId,
        name,
        items: {
          create: data.items.map((item) => ({
            feeHeadId: item.feeHeadId,
            amount: toDecimal(item.amount),
            ...(item.months && item.months.length > 0
              ? {
                  months: {
                    create: item.months.map((m) => ({ month: m })),
                  },
                }
              : {}),
          })),
        },
      },
      include: {
        items: { include: { feeHead: true, months: true } },
        class: true,
        session: true,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "fee",
        entityType: "FeeStructure",
        entityId: structure.id,
        newValue: structure,
      },
      tx,
    );

    // Sync student ledgers automatically for new structure
    const enrollments = await tx.studentEnrollment.findMany({
      where: { classId: data.classId, sessionId: data.sessionId, student: { schoolId } },
      select: { studentId: true }
    });
    const studentIds = enrollments.map(e => e.studentId);
    for (const studentId of studentIds) {
      await generateStudentMonthlyLedgerInTx(tx, {
        schoolId,
        studentId,
        sessionId: data.sessionId,
        classId: data.classId,
        userId: user.id,
      });
    }

    return structure;
  });
}

export async function updateFeeStructure(input: UpdateFeeStructureInput) {
  const { user } = await requirePermission("fee.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateFeeStructureSchema, input);

  const existing = await prisma.feeStructure.findFirst({
    where: { id: data.id, session: { schoolId } },
    include: { items: true, class: true, session: true },
  });
  if (!existing) throw new Error("Fee structure not found");

  const headIds = data.items.map((i) => i.feeHeadId);
  if (new Set(headIds).size !== headIds.length) {
    throw new Error("Each fee head can only appear once in a fee structure");
  }

  return prisma.$transaction(async (tx) => {
    await tx.feeStructureItem.deleteMany({ where: { feeStructureId: data.id } });

    const updated = await tx.feeStructure.update({
      where: { id: data.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        items: {
          create: data.items.map((item) => ({
            feeHeadId: item.feeHeadId,
            amount: toDecimal(item.amount),
            ...(item.months && item.months.length > 0
              ? {
                  months: {
                    create: item.months.map((m) => ({ month: m })),
                  },
                }
              : {}),
          })),
        },
      },
      include: {
        items: { include: { feeHead: true, months: true } },
        class: true,
        session: true,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "fee",
        entityType: "FeeStructure",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );

    // Sync student ledgers automatically
    const enrollments = await tx.studentEnrollment.findMany({
      where: { classId: existing.classId, sessionId: existing.sessionId, student: { schoolId } },
      select: { studentId: true }
    });
    const studentIds = enrollments.map(e => e.studentId);

    let studentsUpdated = 0;
    let ledgerEntriesUpdated = 0;
    let paidEntriesSkipped = 0;

    if (studentIds.length > 0) {
      const studentFees = await tx.studentFee.findMany({
        where: { studentId: { in: studentIds }, sessionId: existing.sessionId },
        include: { allocations: true }
      });

      const feeGroup = new Map<string, Map<string, typeof studentFees>>();
      for (const f of studentFees) {
        if (!feeGroup.has(f.studentId)) {
          feeGroup.set(f.studentId, new Map());
        }
        const studentMap = feeGroup.get(f.studentId)!;
        const monthKey = f.month || "OTHER";
        if (!studentMap.has(monthKey)) {
          studentMap.set(monthKey, []);
        }
        studentMap.get(monthKey)!.push(f);
      }

      for (const studentId of studentIds) {
        const studentMap = feeGroup.get(studentId) || new Map();
        let studentWasUpdated = false;

        const student = await tx.student.findUnique({
          where: { id: studentId },
          select: { admissionDate: true }
        });
        if (!student) continue;

        let startAcademicIdx = 0;
        if (student.admissionDate && student.admissionDate > existing.session.startDate) {
          const admissionMonth = dateToFeeMonth(student.admissionDate);
          const admIdx = getAcademicMonthIndex(admissionMonth);
          if (admIdx > 0 && student.admissionDate <= existing.session.endDate) {
            startAcademicIdx = admIdx;
          }
        }

        for (const month of ALL_FEE_MONTHS) {
          const monthIdx = getAcademicMonthIndex(month);
          if (monthIdx < startAcademicIdx) continue;

          const monthFees = studentMap.get(month) || [];
          const isPaid = monthFees.some((f: any) => 
            f.status === "PAID" || 
            f.status === "PARTIAL" || 
            (f.allocations && f.allocations.length > 0)
          );

          if (isPaid) {
            paidEntriesSkipped += monthFees.length;
            continue;
          }

          if (monthFees.length > 0) {
            await tx.studentFee.deleteMany({
              where: { id: { in: monthFees.map((f: any) => f.id) } }
            });
            studentWasUpdated = true;
          }

          for (const item of updated.items) {
            const applicableMonths = getApplicableMonthsForItem(item);
            if (applicableMonths.includes(month)) {
              const { dueDate, dueYear } = computeMonthDueDate(existing.session.startDate, month);
              await tx.studentFee.create({
                data: {
                  studentId,
                  feeHeadId: item.feeHeadId,
                  sessionId: existing.sessionId,
                  amount: item.amount,
                  month,
                  dueYear,
                  dueDate,
                  status: StudentFeeStatus.PENDING,
                  remarks: "Regenerated from updated fee structure template"
                }
              });
              ledgerEntriesUpdated++;
              studentWasUpdated = true;
            }
          }
        }

        if (studentWasUpdated) {
          studentsUpdated++;
        }
      }
    }

    return {
      structure: updated,
      stats: {
        studentsUpdated,
        ledgerEntriesUpdated,
        paidEntriesSkipped,
      }
    };
  });
}

// ── Student Fees / Ledger ──

export async function listStudentFees(input?: {
  page?: number;
  pageSize?: number;
  search?: string;
  sessionId?: string;
  studentId?: string;
  familyId?: string;
  status?: StudentFeeStatus;
}) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listStudentFeesSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  if (user.role === Role.STUDENT) {
    if (!user.studentId) throw new Error("Student profile not linked");
    params.studentId = user.studentId;
  }

  const where = {
    student: {
      schoolId,
      ...(params.familyId ? { familyId: params.familyId } : {}),
      ...(params.search
        ? {
            OR: [
              { fullName: { contains: params.search } },
              { admissionNo: { contains: params.search } },
              {
                family: {
                  OR: [
                    { fatherName: { contains: params.search } },
                    { motherName: { contains: params.search } },
                    { primaryPhone: { contains: params.search } },
                    { secondaryPhone: { contains: params.search } },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.studentId ? { studentId: params.studentId } : {}),
    ...(params.status ? { status: params.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.studentFee.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true, familyId: true } },
        feeHead: true,
        session: true,
        allocations: true,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.studentFee.count({ where }),
  ]);

  return {
    items: items.map((f) => ({
      id: f.id,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      studentId: f.studentId,
      feeHeadId: f.feeHeadId,
      sessionId: f.sessionId,
      dueDate: f.dueDate,
      status: f.status,
      remarks: f.remarks,
      amount: decimalToNumber(f.amount),
      student: {
        id: f.student.id,
        fullName: f.student.fullName,
        admissionNo: f.student.admissionNo,
        familyId: f.student.familyId,
      },
      feeHead: {
        id: f.feeHead.id,
        name: f.feeHead.name,
      },
      session: {
        id: f.session.id,
        name: f.session.name,
      },
      allocations: f.allocations.map((a) => ({
        id: a.id,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        paymentId: a.paymentId,
        studentId: a.studentId,
        studentFeeId: a.studentFeeId,
        amount: decimalToNumber(a.amount),
      })),
      paidAmount: decimalToNumber(sumDecimals(f.allocations.map((a) => a.amount))),
      balance: decimalToNumber(
        toDecimal(f.amount).sub(sumDecimals(f.allocations.map((a) => a.amount))),
      ),
    })),
    total,
    page,
    pageSize,
  };
}

/** Student fee ledger: total / paid / remaining + structure lines + payment history. */
export async function getStudentFeeLedger(studentId: string) {
  const { user } = await requirePermission("fee.view");
  const schoolId = schoolIdFromUser(user);

  if (user.role === Role.STUDENT && user.studentId !== studentId) {
    throw new Error("FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true,
      fullName: true,
      admissionNo: true,
      familyId: true,
      enrollments: {
        include: { class: true, section: true, session: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!student) throw new Error("Student not found");

  const enrollment = student.enrollments[0] ?? null;
  const sessionId = enrollment?.sessionId;

  // ── Parallel: fees + allocations are independent of each other ────────────
  const [fees, allocations] = await Promise.all([
    prisma.studentFee.findMany({
      where: {
        studentId,
        ...(sessionId ? { sessionId } : {}),
      },
      include: {
        feeHead: true,
        session: true,
        allocations: true,
      },
      orderBy: [{ feeHead: { name: "asc" } }],
    }),
    prisma.feePaymentAllocation.findMany({
      where: { studentId },
      include: {
        payment: {
          select: {
            id: true,
            receiptNo: true,
            paidAt: true,
            method: true,
            referenceNo: true,
            notes: true,
            amount: true,
            recordedBy: { select: { name: true } },
          },
        },
        studentFee: { include: { feeHead: true } },
      },
      orderBy: { payment: { paidAt: "desc" } },
    }),
  ]);

  const { lines, totalFee, paid, remaining } = ledgerFromFees(fees);

  let feeStructure: {
    id: string;
    name: string;
    items: Array<{ feeHead: string; amount: number }>;
    totalAnnualFee: number;
  } | null = null;

  if (enrollment) {
    const structure = await findFeeStructureForClass(
      prisma,
      enrollment.sessionId,
      enrollment.classId,
    );
    if (structure) {
      const items = structure.items.map((i) => ({
        feeHead: i.feeHead.name,
        amount: decimalToNumber(i.amount),
      }));
      feeStructure = {
        id: structure.id,
        name: structure.name,
        items,
        totalAnnualFee: items.reduce((s, i) => s + i.amount, 0),
      };
    }
  }

  const paymentMap = new Map<
    string,
    {
      id: string;
      receiptNo: string;
      paidAt: Date;
      method: string;
      referenceNo: string | null;
      notes: string | null;
      paymentAmount: number;
      allocatedToStudent: number;
      recordedBy: string | null;
      lines: Array<{ feeHead: string; amount: number; dueDate: Date | null }>;
    }
  >();

  for (const a of allocations) {
    if (!a.paymentId || !a.payment) continue;
    const existing = paymentMap.get(a.paymentId);
    const line = {
      feeHead: a.studentFee?.feeHead.name ?? "Advance",
      amount: decimalToNumber(a.amount),
      dueDate: a.studentFee?.dueDate ?? null,
    };
    if (existing) {
      existing.allocatedToStudent += line.amount;
      existing.lines.push(line);
    } else {
      paymentMap.set(a.paymentId, {
        id: a.payment.id,
        receiptNo: a.payment.receiptNo,
        paidAt: a.payment.paidAt,
        method: a.payment.method,
        referenceNo: a.payment.referenceNo,
        notes: a.payment.notes,
        paymentAmount: decimalToNumber(a.payment.amount),
        allocatedToStudent: line.amount,
        recordedBy: user.role === Role.STUDENT ? null : a.payment.recordedBy?.name ?? null,
        lines: [line],
      });
    }
  }

  const paymentHistory = Array.from(paymentMap.values()).sort(
    (a, b) => b.paidAt.getTime() - a.paidAt.getTime(),
  );

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      admissionNo: student.admissionNo,
    },
    currentClass: enrollment
      ? {
          className: enrollment.class.name,
          sectionName: enrollment.section.name,
          sessionName: enrollment.session.name,
          label: `${enrollment.class.name}-${enrollment.section.name}`,
        }
      : null,
    feeStructure,
    totalFee,
    paid,
    remaining,
    lines,
    paymentHistory,
  };
}


/** Portal-safe view: no parent details, family IDs, or accountant info. */
export async function getStudentPortalFees() {
  const { user } = await requirePermission("fee.view");
  if (user.role !== Role.STUDENT || !user.studentId) {
    throw new Error("Student portal is only available for student accounts");
  }

  const schoolId = schoolIdFromUser(user);
  // Await the lazy student getter
  const student = await user.student;
  const familyId = student?.familyId ?? student?.family?.id ?? null;

  // ── Parallel: ledger and siblings are independent ─────────────────────────
  const [ledger, siblings] = await Promise.all([
    getStudentFeeLedger(user.studentId),
    familyId
      ? prisma.student.findMany({
          where: {
            familyId,
            id: { not: user.studentId },
            schoolId,
            status: "ACTIVE",
          },
          select: {
            id: true,
            fullName: true,
            enrollments: {
              include: { class: true, section: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            studentFees: {
              include: {
                allocations: true,
                feeHead: true,
                session: true,
              },
            },
          },
          orderBy: { fullName: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const siblingSummary = siblings.map((s) => {
    const { remaining } = ledgerFromFees(s.studentFees);
    const enrollment = s.enrollments[0];
    return {
      fullName: s.fullName,
      classLabel: enrollment
        ? `${enrollment.class.name}-${enrollment.section.name}`
        : "—",
      remainingFee: remaining,
    };
  });

  return {
    currentClass: ledger.currentClass,
    feeStructure: ledger.feeStructure,
    totalFee: ledger.totalFee,
    paid: ledger.paid,
    remaining: ledger.remaining,
    lines: ledger.lines.map((l) => ({
      feeHead: l.feeHead.name,
      amount: l.amount,
      paidAmount: l.paidAmount,
      remaining: l.remaining,
      status: l.status,
    })),
    paymentHistory: ledger.paymentHistory.map((p) => ({
      date: p.paidAt,
      amount: p.allocatedToStudent,
      method: p.method,
      referenceNo: p.referenceNo,
      remarks: p.notes,
      receiptNo: p.receiptNo,
      paymentId: p.id,
    })),
    siblings: siblingSummary,
  };
}


/** Per-sibling dues for family payment allocation UI. */
export async function getFamilyFeeDues(familyId: string) {
  const { user } = await requirePermission("payment.view");
  const schoolId = schoolIdFromUser(user);

  const family = await prisma.family.findFirst({
    where: { id: familyId, schoolId },
    include: {
      students: {
        where: { status: "ACTIVE" },
        orderBy: { fullName: "asc" },
        include: {
          enrollments: {
            include: { class: true, section: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          studentFees: { include: { allocations: true, feeHead: true, session: true } },
        },
      },
    },
  });
  if (!family) throw new Error("Family not found");

  return family.students.map((s) => {
    const { totalFee, paid, remaining, lines } = ledgerFromFees(s.studentFees);
    const enrollment = s.enrollments[0];
    return {
      studentId: s.id,
      fullName: s.fullName,
      admissionNo: s.admissionNo,
      classLabel: enrollment
        ? `${enrollment.class.name}-${enrollment.section.name}`
        : "—",
      totalFee,
      paid,
      remaining,
      lines: lines.map((l) => ({
        id: l.id,
        feeHead: l.feeHead.name,
        amount: l.amount,
        paidAmount: l.paidAmount,
        remaining: l.remaining,
        status: l.status,
      })),
    };
  });
}

// ── Payments ──

export async function listPayments(input?: {
  page?: number;
  pageSize?: number;
  familyId?: string;
}) {
  const { user } = await requirePermission("payment.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listPaymentsSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  let familyFilter = params.familyId ? { id: params.familyId } : {};

  if (user.role === Role.STUDENT) {
    if (!user.studentId) throw new Error("Student profile not linked");
    const me = await prisma.student.findFirst({
      where: { id: user.studentId, schoolId },
      select: { familyId: true },
    });
    if (!me) throw new Error("Student not found");
    familyFilter = { id: me.familyId };
  }

  const where = {
    family: { schoolId, ...familyFilter },
  };

  const [items, total] = await Promise.all([
    prisma.familyPayment.findMany({
      where,
      include: {
        family: true,
        recordedBy: { select: { id: true, name: true } },
        allocations: {
          include: {
            student: { select: { id: true, fullName: true, admissionNo: true } },
            studentFee: { include: { feeHead: true } },
          },
        },
        receipt: true,
      },
      orderBy: { paidAt: "desc" },
      skip,
      take,
    }),
    prisma.familyPayment.count({ where }),
  ]);

  const mapped = items.map((p) => ({
    id: p.id,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    familyId: p.familyId,
    amount: decimalToNumber(p.amount),
    method: p.method,
    referenceNo: p.referenceNo,
    paidAt: p.paidAt,
    receiptNo: p.receiptNo,
    notes: p.notes,
    recordedById: p.recordedById,
    family: {
      id: p.family.id,
      fatherName: p.family.fatherName,
      motherName: p.family.motherName,
      primaryPhone: p.family.primaryPhone,
    },
    recordedBy: user.role === Role.STUDENT ? null : p.recordedBy ? {
      id: p.recordedBy.id,
      name: p.recordedBy.name,
    } : null,
    allocations: p.allocations.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      paymentId: a.paymentId,
      studentId: a.studentId,
      studentFeeId: a.studentFeeId,
      amount: decimalToNumber(a.amount),
      student: {
        id: a.student.id,
        fullName: a.student.fullName,
        admissionNo: a.student.admissionNo,
      },
      studentFee: a.studentFee
        ? {
            id: a.studentFee.id,
            createdAt: a.studentFee.createdAt,
            updatedAt: a.studentFee.updatedAt,
            studentId: a.studentFee.studentId,
            feeHeadId: a.studentFee.feeHeadId,
            sessionId: a.studentFee.sessionId,
            amount: decimalToNumber(a.studentFee.amount),
            dueDate: a.studentFee.dueDate,
            status: a.studentFee.status,
            remarks: a.studentFee.remarks,
            feeHead: {
              id: a.studentFee.feeHead.id,
              name: a.studentFee.feeHead.name,
            },
          }
        : null,
    })),
  }));

  return {
    items: mapped,
    total,
    page,
    pageSize,
  };
}

export async function recordFamilyPaymentInTx(
  tx: Prisma.TransactionClient,
  opts: {
    schoolId: string;
    userId?: string | null;
    familyId: string;
    amount: Prisma.Decimal | number;
    method: PaymentMethod;
    referenceNo?: string | null;
    paidAt?: Date;
    notes?: string | null;
    allocations: Array<{ studentId: string; amount: Prisma.Decimal | number; studentFeeId?: string | null }>;
  },
) {
  // Invariant 4 Idempotency Check: Prevent duplicate payment and wallet credit
  if (opts.referenceNo && opts.referenceNo.trim()) {
    const existingPayment = await tx.familyPayment.findFirst({
      where: {
        familyId: opts.familyId,
        referenceNo: opts.referenceNo.trim(),
      },
      include: { receipt: true },
    });
    if (existingPayment && existingPayment.receipt) {
      return { payment: existingPayment, receipt: existingPayment.receipt, duplicate: true };
    }
  }

  const family = await tx.family.findFirst({
    where: { id: opts.familyId, schoolId: opts.schoolId },
    include: { students: true },
  });
  if (!family) throw new Error("Family not found");

  const paymentAmount = toDecimal(opts.amount);
  const allocationTotal = sumDecimals(opts.allocations.map((a) => a.amount));

  if (allocationTotal.greaterThan(paymentAmount)) {
    throw new Error(
      `Allocation total (${decimalToNumber(allocationTotal)}) cannot exceed payment amount (${decimalToNumber(paymentAmount)})`,
    );
  }

  const excessAmount = paymentAmount.sub(allocationTotal);

  const familyStudentIds = new Set(family.students.map((s) => s.id));
  const allocFeeIds = opts.allocations
    .map((a) => a.studentFeeId)
    .filter((id): id is string => !!id);

  if (allocFeeIds.length > 0) {
    const fees = await tx.studentFee.findMany({
      where: { id: { in: allocFeeIds } },
      select: { id: true, studentId: true },
    });
    const feeMap = new Map(fees.map((f) => [f.id, f.studentId]));

    for (const alloc of opts.allocations) {
      if (!familyStudentIds.has(alloc.studentId)) {
        throw new Error("All allocations must be for students in the payment family");
      }
      if (alloc.studentFeeId) {
        const studentIdForFee = feeMap.get(alloc.studentFeeId);
        if (!studentIdForFee || studentIdForFee !== alloc.studentId) {
          throw new Error("Invalid student fee for student allocation");
        }
      }
    }
  } else {
    for (const alloc of opts.allocations) {
      if (!familyStudentIds.has(alloc.studentId)) {
        throw new Error("All allocations must be for students in the payment family");
      }
    }
  }

  const branding = await getBrandingBySchoolId(opts.schoolId, tx);

  const receiptNo = await generateReceiptNoInTx(tx, opts.schoolId);
  const expanded: Array<{
    studentId: string;
    studentFeeId: string | null;
    amount: Prisma.Decimal;
  }> = [];

  const allocationResults = await Promise.all(
    opts.allocations.map((alloc) =>
      expandAllocationToFees(
        tx,
        alloc.studentId,
        toDecimal(alloc.amount),
        alloc.studentFeeId,
      )
    )
  );

  for (const rows of allocationResults) {
    expanded.push(...rows);
  }

  const payment = await tx.familyPayment.create({
    data: {
      familyId: opts.familyId,
      amount: paymentAmount,
      method: opts.method,
      referenceNo: opts.referenceNo,
      paidAt: opts.paidAt ?? new Date(),
      receiptNo,
      notes: opts.notes,
      recordedById: opts.userId ?? null,
      allocations: {
        create: expanded.map((a) => ({
          studentId: a.studentId,
          studentFeeId: a.studentFeeId,
          amount: a.amount,
        })),
      },
    },
    include: {
      family: true,
      allocations: {
        include: {
          student: true,
          studentFee: { include: { feeHead: true } },
        },
      },
    },
  });

  const feeIds = [
    ...new Set(
      expanded.map((a) => a.studentFeeId).filter((id): id is string => !!id),
    ),
  ];

  await Promise.all(
    feeIds.map((feeId) => recalcStudentFeeStatus(tx, feeId))
  );

  // Part 1: Credit excess payment to FamilyAdvanceWallet
  if (excessAmount.greaterThan(0)) {
    const { recordWalletTransactionInTx } = await import("@/server/services/wallet.service");
    await recordWalletTransactionInTx(tx, {
      familyId: opts.familyId,
      type: AdvanceTransactionType.CREDIT_FROM_PAYMENT,
      amount: excessAmount,
      paymentId: payment.id,
      reason: "Excess payment credited to advance wallet",
      userId: opts.userId,
    });
  }

  // Part 4: Auto-reconciliation trigger
  const { reconcileFamilyAdvanceInTx } = await import("@/server/services/wallet.service");
  await reconcileFamilyAdvanceInTx(tx, {
    schoolId: opts.schoolId,
    familyId: opts.familyId,
    userId: opts.userId,
  });

  const snapshot = {
    receiptNo: payment.receiptNo,
    paidAt: payment.paidAt.toISOString(),
    amount: decimalToNumber(payment.amount),
    amountFormatted: formatCurrency(decimalToNumber(payment.amount)),
    advanceCredited: decimalToNumber(excessAmount),
    method: payment.method,
    referenceNo: payment.referenceNo,
    notes: payment.notes,
    family: {
      id: payment.family.id,
      fatherName: payment.family.fatherName,
      motherName: payment.family.motherName,
      primaryPhone: payment.family.primaryPhone,
    },
    branding: {
      schoolName: branding.schoolName,
      address: branding.address,
      phone: branding.phone,
      email: branding.email,
      receiptFooter: branding.receiptFooter,
      logoDocumentId: branding.logoDocumentId,
    },
    allocations: payment.allocations.map((a) => ({
      studentName: a.student.fullName,
      admissionNo: a.student.admissionNo,
      feeHead: a.studentFee?.feeHead.name ?? "General",
      amount: decimalToNumber(a.amount),
      amountFormatted: formatCurrency(decimalToNumber(a.amount)),
    })),
    recordedBy: opts.userId ?? "System",
    generatedAt: new Date().toISOString(),
  };

  const receipt = await tx.feeReceipt.create({
    data: { paymentId: payment.id, snapshot },
  });

  if (opts.userId) {
    await writeAuditLog(
      {
        schoolId: opts.schoolId,
        userId: opts.userId,
        action: "create",
        module: "payment",
        entityType: "FamilyPayment",
        entityId: payment.id,
        newValue: { receiptNo, amount: decimalToNumber(payment.amount), excess: decimalToNumber(excessAmount) },
      },
      tx,
    );
  }

  return { payment, receipt };
}

export async function recordFamilyPayment(input: RecordPaymentInput) {
  const { user } = await requirePermission("payment.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(recordPaymentSchema, input);

  return prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      ...data,
      schoolId,
      userId: user.id,
    });
  }, { timeout: 35000 });
}

export async function getPaymentReceipt(paymentId: string) {
  const { user } = await requirePermission("payment.view");
  const schoolId = schoolIdFromUser(user);

  const payment = await prisma.familyPayment.findFirst({
    where: { id: paymentId, family: { schoolId } },
    include: {
      receipt: true,
      family: true,
      allocations: { include: { student: true } },
    },
  });
  if (!payment) throw new Error("Payment not found");

  if (user.role === Role.STUDENT) {
    if (!user.studentId) throw new Error("FORBIDDEN");
    const me = await prisma.student.findFirst({
      where: { id: user.studentId, schoolId },
      select: { familyId: true },
    });
    if (!me || me.familyId !== payment.familyId) throw new Error("FORBIDDEN");
  }

  if (payment.receipt) {
    if (user.role === Role.STUDENT) {
      const snap = payment.receipt.snapshot as Record<string, unknown>;
      const safe = { ...snap };
      delete safe.family;
      delete safe.recordedBy;
      return { ...payment.receipt, snapshot: safe };
    }
    return payment.receipt;
  }

  const branding = await getBrandingBySchoolId(schoolId);
  const snapshot = {
    receiptNo: payment.receiptNo,
    paidAt: formatDate(payment.paidAt),
    amountFormatted: formatCurrency(decimalToNumber(payment.amount)),
    branding,
    family: user.role === Role.STUDENT ? undefined : payment.family,
  };

  return { paymentId: payment.id, snapshot, generatedAt: payment.createdAt };
}

export async function generateStudentMonthlyLedger(input: GenerateMonthlyLedgerInput) {
  const { user } = await requirePermission("fee.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(generateMonthlyLedgerSchema, input);

  return prisma.$transaction(async (tx) => {
    return generateStudentMonthlyLedgerInTx(tx, {
      schoolId,
      studentId: data.studentId,
      sessionId: data.sessionId,
      classId: data.classId,
      userId: user.id,
      requireStructure: true,
    });
  });
}

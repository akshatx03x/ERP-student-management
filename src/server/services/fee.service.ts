import { Prisma, Role, StudentFeeStatus } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { getBrandingBySchoolId } from "@/server/services/branding.service";
import {
  decimalToNumber,
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
  listPaymentsSchema,
  listStudentFeesSchema,
  recordPaymentSchema,
  updateFeeHeadSchema,
  updateFeeStructureSchema,
  type CreateFeeHeadInput,
  type CreateFeeStructureInput,
  type RecordPaymentInput,
  type UpdateFeeStructureInput,
} from "@/server/validators/fee.validator";

async function recalcStudentFeeStatus(
  tx: Prisma.TransactionClient,
  studentFeeId: string,
) {
  const fee = await tx.studentFee.findUnique({
    where: { id: studentFeeId },
    include: { allocations: true },
  });
  if (!fee) return;

  const paid = sumDecimals(fee.allocations.map((a) => a.amount));
  const total = toDecimal(fee.amount);
  let status: StudentFeeStatus = StudentFeeStatus.PENDING;

  if (paid.greaterThanOrEqualTo(total)) {
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

async function generateReceiptNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}`;
  const count = await prisma.familyPayment.count({
    where: { receiptNo: { startsWith: prefix } },
  });
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

/** Find the single fee structure for a class in a session (business rule: one per class/session). */
export async function findFeeStructureForClass(
  tx: Prisma.TransactionClient | typeof prisma,
  sessionId: string,
  classId: string,
) {
  return tx.feeStructure.findFirst({
    where: { sessionId, classId },
    include: { items: { include: { feeHead: true } }, class: true, session: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Attach the class fee structure to a student as StudentFee rows.
 * Idempotent per (student, feeHead, session). Call inside an existing transaction.
 */
export async function attachFeeStructureInTx(
  tx: Prisma.TransactionClient,
  opts: {
    schoolId: string;
    studentId: string;
    sessionId: string;
    classId: string;
    userId: string;
    requireStructure?: boolean;
  },
): Promise<{ attached: number; structureId: string | null }> {
  const structure = await findFeeStructureForClass(tx, opts.sessionId, opts.classId);

  if (!structure) {
    if (opts.requireStructure) {
      throw new Error(
        "No fee structure exists for this class in the selected academic session. Create a fee structure before admitting the student.",
      );
    }
    return { attached: 0, structureId: null };
  }

  let attached = 0;
  for (const item of structure.items) {
    const existing = await tx.studentFee.findFirst({
      where: {
        studentId: opts.studentId,
        feeHeadId: item.feeHeadId,
        sessionId: opts.sessionId,
      },
    });
    if (existing) continue;

    await tx.studentFee.create({
      data: {
        studentId: opts.studentId,
        feeHeadId: item.feeHeadId,
        sessionId: opts.sessionId,
        amount: item.amount,
        status: StudentFeeStatus.PENDING,
        remarks: `Auto-attached from ${structure.name}`,
      },
    });
    attached += 1;
  }

  if (attached > 0) {
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
          attached,
          sessionId: opts.sessionId,
          classId: opts.classId,
        },
      },
      tx,
    );
  }

  return { attached, structureId: structure.id };
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
    const balance = toDecimal(fee.amount).sub(alreadyPaid);
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
    status: StudentFeeStatus;
    remarks: string | null;
    dueDate: Date | null;
    feeHead: { id: string; name: string };
    session: { id: string; name: string };
    allocations: Array<{ amount: Prisma.Decimal | number }>;
  }>,
) {
  const lines = fees.map((f) => {
    const amount = decimalToNumber(f.amount);
    const paidAmount = decimalToNumber(sumDecimals(f.allocations.map((a) => a.amount)));
    return {
      id: f.id,
      feeHead: f.feeHead,
      session: f.session,
      amount,
      paidAmount,
      remaining: Math.max(0, amount - paidAmount),
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
      items: { include: { feeHead: true }, orderBy: { feeHead: { name: "asc" } } },
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
          })),
        },
      },
      include: { items: { include: { feeHead: true } }, class: true, session: true },
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
          })),
        },
      },
      include: { items: { include: { feeHead: true } }, class: true, session: true },
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

    return updated;
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
              { fullName: { contains: params.search, mode: "insensitive" as const } },
              { admissionNo: { contains: params.search, mode: "insensitive" as const } },
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

  const fees = await prisma.studentFee.findMany({
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
  });

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

  const allocations = await prisma.feePaymentAllocation.findMany({
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
        },
      },
      studentFee: { include: { feeHead: true } },
    },
    orderBy: { payment: { paidAt: "desc" } },
  });

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
      lines: Array<{ feeHead: string; amount: number }>;
    }
  >();

  for (const a of allocations) {
    const existing = paymentMap.get(a.paymentId);
    const line = {
      feeHead: a.studentFee?.feeHead.name ?? "Advance",
      amount: decimalToNumber(a.amount),
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

  const ledger = await getStudentFeeLedger(user.studentId);
  const schoolId = schoolIdFromUser(user);

  const me = await prisma.student.findFirst({
    where: { id: user.studentId, schoolId },
    select: { familyId: true },
  });

  const siblings = me
    ? await prisma.student.findMany({
        where: {
          familyId: me.familyId,
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
    : [];

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

export async function recordFamilyPayment(input: RecordPaymentInput) {
  const { user } = await requirePermission("payment.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(recordPaymentSchema, input);

  const family = await prisma.family.findFirst({
    where: { id: data.familyId, schoolId },
    include: { students: true },
  });
  if (!family) throw new Error("Family not found");

  const paymentAmount = toDecimal(data.amount);
  const allocationTotal = sumDecimals(data.allocations.map((a) => a.amount));

  if (!allocationTotal.equals(paymentAmount)) {
    throw new Error(
      `Allocation total (${decimalToNumber(allocationTotal)}) must equal payment amount (${decimalToNumber(paymentAmount)})`,
    );
  }

  const familyStudentIds = new Set(family.students.map((s) => s.id));
  for (const alloc of data.allocations) {
    if (!familyStudentIds.has(alloc.studentId)) {
      throw new Error("All allocations must be for students in the payment family");
    }
    if (alloc.studentFeeId) {
      const fee = await prisma.studentFee.findFirst({
        where: { id: alloc.studentFeeId, studentId: alloc.studentId },
      });
      if (!fee) throw new Error(`Invalid student fee for student allocation`);
    }
  }

  const receiptNo = await generateReceiptNo();
  const branding = await getBrandingBySchoolId(schoolId);

  return prisma.$transaction(async (tx) => {
    const expanded: Array<{
      studentId: string;
      studentFeeId: string | null;
      amount: Prisma.Decimal;
    }> = [];

    for (const alloc of data.allocations) {
      const rows = await expandAllocationToFees(
        tx,
        alloc.studentId,
        toDecimal(alloc.amount),
        alloc.studentFeeId,
      );
      expanded.push(...rows);
    }

    const payment = await tx.familyPayment.create({
      data: {
        familyId: data.familyId,
        amount: paymentAmount,
        method: data.method,
        referenceNo: data.referenceNo,
        paidAt: data.paidAt ?? new Date(),
        receiptNo,
        notes: data.notes,
        recordedById: user.id,
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

    for (const feeId of feeIds) {
      await recalcStudentFeeStatus(tx, feeId);
    }

    const snapshot = {
      receiptNo: payment.receiptNo,
      paidAt: payment.paidAt.toISOString(),
      amount: decimalToNumber(payment.amount),
      amountFormatted: formatCurrency(decimalToNumber(payment.amount)),
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
      recordedBy: user.name,
      generatedAt: new Date().toISOString(),
    };

    const receipt = await tx.feeReceipt.create({
      data: { paymentId: payment.id, snapshot },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "payment",
        entityType: "FamilyPayment",
        entityId: payment.id,
        newValue: { receiptNo, amount: decimalToNumber(payment.amount) },
      },
      tx,
    );

    return { payment, receipt };
  });
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
      const { family: _f, recordedBy: _r, ...safe } = snap;
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

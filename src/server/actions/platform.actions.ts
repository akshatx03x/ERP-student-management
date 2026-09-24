"use server";

import { revalidatePath } from "next/cache";
import {
  listExamTypes,
  createExamType,
  listExams,
  createExam,
  createExamSubject,
  enterMarks,
  generateReportCard,
  getExam,
} from "@/server/services/exam.service";
import {
  listHomework,
  createHomework,
  deleteHomework,
} from "@/server/services/homework.service";
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
} from "@/server/services/document.service";
import {
  listNotices,
  createNotice,
  deleteNotice,
} from "@/server/services/notice.service";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { safeAction, MAX_IMAGE_FILE_SIZE_BYTES } from "@/server/lib/action-response";
import { schoolIdFromUser, decimalToNumber } from "@/server/lib/helpers";
import type {
  CreateExamTypeInput,
  CreateExamInput,
  CreateExamSubjectInput,
  MarkEntryInput,
  GenerateReportCardInput,
} from "@/server/validators/exam.validator";
import type { CreateHomeworkInput } from "@/server/validators/homework.validator";
import type { CreateNoticeInput } from "@/server/validators/notice.validator";
import type { DocumentOwnerType, DocumentType } from "@prisma/client";

export async function listExamTypesAction(sessionId: string) {
  return listExamTypes(sessionId);
}
export async function createExamTypeAction(input: CreateExamTypeInput) {
  return createExamType(input);
}
export async function listExamsAction(input?: Parameters<typeof listExams>[0]) {
  return listExams(input);
}
export async function getExamAction(id: string) {
  return getExam(id);
}
export async function createExamAction(input: CreateExamInput) {
  return createExam(input);
}
export async function createExamSubjectAction(input: CreateExamSubjectInput) {
  return createExamSubject(input);
}
export async function enterMarksAction(input: MarkEntryInput) {
  return enterMarks(input);
}
export async function generateReportCardAction(input: GenerateReportCardInput) {
  return generateReportCard(input);
}

export async function listHomeworkAction(input?: Parameters<typeof listHomework>[0]) {
  return listHomework(input);
}
export async function createHomeworkAction(input: CreateHomeworkInput) {
  const r = await createHomework(input);
  revalidatePath("/homework");
  return r;
}
export async function deleteHomeworkAction(id: string) {
  await deleteHomework(id);
  revalidatePath("/homework");
}

export async function listDocumentsAction(ownerType: DocumentOwnerType, ownerId: string) {
  return listDocuments(ownerType, ownerId);
}
export async function uploadDocumentAction(input: {
  ownerType: DocumentOwnerType;
  ownerId: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  base64: string;
}) {
  return safeAction("uploadDocumentAction", async () => {
    const data = Buffer.from(input.base64, "base64");
    if (data.byteLength > MAX_IMAGE_FILE_SIZE_BYTES) {
      throw new Error("Image upload failed: image size exceeds the 5 MB limit. Please choose a smaller image.");
    }
    const r = await uploadDocument({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      type: input.type,
      fileName: input.fileName,
      mimeType: input.mimeType,
      data,
    });
    revalidatePath("/documents");
    return r;
  }, "Failed to upload document");
}
export async function deleteDocumentAction(id: string) {
  await deleteDocument(id);
  revalidatePath("/documents");
}

export async function listNoticesAction(input?: Parameters<typeof listNotices>[0]) {
  return listNotices(input);
}
export async function createNoticeAction(input: CreateNoticeInput) {
  const r = await createNotice(input);
  revalidatePath("/notices");
  return r;
}
export async function deleteNoticeAction(id: string) {
  await deleteNotice(id);
  revalidatePath("/notices");
}

export async function listAuditLogsAction(input?: { page?: number; pageSize?: number; module?: string }) {
  const { user } = await requirePermission("audit.view");
  const schoolId = schoolIdFromUser(user);
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? 50;
  const where = {
    schoolId,
    ...(input?.module ? { module: input.module } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getReportsSummaryAction() {
  const { user } = await requirePermission("report.view");
  const schoolId = schoolIdFromUser(user);

  const [
    students,
    attendance,
    feesCollected,
    pendingFees,
    admissions,
    walletAgg,
    cashbookCount,
    walletTxCount,
    recentPayments,
    recentCashbook,
    recentWallet,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { student: { schoolId } },
      _count: true,
    }),
    prisma.familyPayment.aggregate({
      where: { family: { schoolId } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.studentFee.aggregate({
      where: {
        student: { schoolId },
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      },
      _sum: { amount: true },
    }),
    prisma.admissionApplication.groupBy({
      by: ["status"],
      where: { session: { schoolId } },
      _count: true,
    }),
    prisma.familyAdvanceWallet.aggregate({
      where: { family: { schoolId } },
      _sum: { balance: true },
    }),
    prisma.cashBookEntry.count({
      where: { schoolId, isVoided: false },
    }),
    prisma.advanceTransaction.count({
      where: { family: { schoolId } },
    }),
    prisma.familyPayment.findMany({
      where: { family: { schoolId } },
      orderBy: { paidAt: "desc" },
      take: 8,
      include: {
        family: { select: { fatherName: true } },
        allocations: { take: 1, include: { student: { select: { fullName: true } } } },
      },
    }),
    prisma.cashBookEntry.findMany({
      where: { schoolId, isVoided: false },
      orderBy: { date: "desc" },
      take: 8,
    }),
    prisma.advanceTransaction.findMany({
      where: { family: { schoolId } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        family: { select: { fatherName: true } },
        targetStudent: { select: { fullName: true } },
      },
    }),
  ]);

  const recentTransactions = [
    ...recentPayments.map((p) => ({
      id: p.id,
      date: p.paidAt,
      register: "RECEIPT" as const,
      type: "Fee Collection",
      ref: p.receiptNo,
      party: p.allocations[0]?.student?.fullName ?? p.family?.fatherName ?? "—",
      method: p.method,
      amount: decimalToNumber(p.amount),
      flow: "INFLOW" as const,
    })),
    ...recentCashbook.map((c) => ({
      id: c.id,
      date: c.date,
      register: "CASHBOOK" as const,
      type: c.entryType.replace(/_/g, " "),
      ref: c.voucherNo ?? "CB-" + c.id.slice(0, 6).toUpperCase(),
      party: c.description || "Cashbook Record",
      method: "CASH",
      amount: decimalToNumber(c.amount),
      flow: ["MISC_INCOME", "OTHER_INCOME"].includes(c.entryType) ? ("INFLOW" as const) : ("OUTFLOW" as const),
    })),
    ...recentWallet.map((w) => ({
      id: w.id,
      date: w.createdAt,
      register: "WALLET" as const,
      type: w.type.replace(/_/g, " "),
      ref: "WT-" + w.id.slice(0, 8).toUpperCase(),
      party: w.family?.fatherName ?? "Wallet Parent",
      method: w.type === "CREDIT_FROM_PAYMENT" ? "CASH / ONLINE" : "WALLET",
      amount: decimalToNumber(w.amount),
      flow: ["CREDIT_FROM_PAYMENT", "CREDIT_NOTE_ADJUSTMENT"].includes(w.type) ? ("INFLOW" as const) : ("OUTFLOW" as const),
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);

  const totalTransactionCount = feesCollected._count + cashbookCount + walletTxCount;
  const totalInWallet = decimalToNumber(walletAgg._sum.balance ?? 0);
  const totalFeesCollected = Number(feesCollected._sum.amount ?? 0);
  const totalPendingFees = Number(pendingFees._sum.amount ?? 0);

  return {
    students,
    attendance,
    feesCollected: totalFeesCollected,
    paymentCount: feesCollected._count,
    pendingFees: totalPendingFees,
    totalInWallet,
    totalTransactionCount,
    admissions,
    recentTransactions,
  };
}

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
import { schoolIdFromUser } from "@/server/lib/helpers";
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
  const r = await createExamType(input);
  revalidatePath("/examinations");
  return r;
}
export async function listExamsAction(input?: Parameters<typeof listExams>[0]) {
  return listExams(input);
}
export async function getExamAction(id: string) {
  return getExam(id);
}
export async function createExamAction(input: CreateExamInput) {
  const r = await createExam(input);
  revalidatePath("/examinations");
  return r;
}
export async function createExamSubjectAction(input: CreateExamSubjectInput) {
  const r = await createExamSubject(input);
  revalidatePath("/examinations");
  return r;
}
export async function enterMarksAction(input: MarkEntryInput) {
  const r = await enterMarks(input);
  revalidatePath("/examinations");
  return r;
}
export async function generateReportCardAction(input: GenerateReportCardInput) {
  const r = await generateReportCard(input);
  revalidatePath("/examinations");
  return r;
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
  const data = Buffer.from(input.base64, "base64");
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
  const [students, attendance, feesCollected, pendingFees, admissions] = await Promise.all([
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
  ]);
  return {
    students,
    attendance,
    feesCollected: Number(feesCollected._sum.amount ?? 0),
    paymentCount: feesCollected._count,
    pendingFees: Number(pendingFees._sum.amount ?? 0),
    admissions,
  };
}

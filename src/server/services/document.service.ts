import { createHash } from "crypto";
import { DocumentOwnerType, Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  uploadDocumentSchema,
  type UploadDocumentInput,
} from "@/server/validators/document.validator";

export const MAX_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024;

function computeChecksum(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function assertOwnerAccess(
  schoolId: string,
  ownerType: DocumentOwnerType,
  ownerId: string,
  user: { role: Role; studentId: string | null },
) {
  switch (ownerType) {
    case DocumentOwnerType.STUDENT: {
      const student = await prisma.student.findFirst({
        where: { id: ownerId, schoolId },
      });
      if (!student) throw new Error("Student owner not found");
      if (user.role === Role.STUDENT && user.studentId !== ownerId) {
        throw new Error("FORBIDDEN");
      }
      break;
    }
    case DocumentOwnerType.FAMILY: {
      const family = await prisma.family.findFirst({ where: { id: ownerId, schoolId } });
      if (!family) throw new Error("Family owner not found");
      break;
    }
    case DocumentOwnerType.STAFF: {
      const staff = await prisma.staffProfile.findFirst({ where: { id: ownerId, schoolId } });
      if (!staff) throw new Error("Staff owner not found");
      break;
    }
    case DocumentOwnerType.ADMISSION: {
      const admission = await prisma.admissionApplication.findFirst({
        where: { id: ownerId, session: { schoolId } },
      });
      if (!admission) throw new Error("Admission owner not found");
      break;
    }
    case DocumentOwnerType.SCHOOL: {
      if (ownerId !== schoolId) throw new Error("Invalid school document owner");
      break;
    }
    default:
      break;
  }
}

export async function uploadDocument(input: UploadDocumentInput) {
  const { user } = await requirePermission("document.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(uploadDocumentSchema, input);

  const buffer = Buffer.from(data.data);
  if (buffer.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error(`File exceeds maximum size of ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)}MB`);
  }
  if (buffer.byteLength === 0) {
    throw new Error("Empty file not allowed");
  }

  await assertOwnerAccess(schoolId, data.ownerType, data.ownerId, user);

  const checksum = computeChecksum(buffer);

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        schoolId,
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        type: data.type,
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes: buffer.byteLength,
        checksum,
        blob: { create: { data: buffer } },
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "document",
        entityType: "Document",
        entityId: document.id,
        newValue: {
          fileName: document.fileName,
          sizeBytes: document.sizeBytes,
          ownerType: document.ownerType,
        },
      },
      tx,
    );

    return document;
  });
}

export async function getDocument(documentId: string) {
  const { user } = await requirePermission("document.view");
  const schoolId = schoolIdFromUser(user);

  const document = await prisma.document.findFirst({
    where: { id: documentId, schoolId },
  });
  if (!document) throw new Error("Document not found");

  await assertOwnerAccess(schoolId, document.ownerType, document.ownerId, user);

  return document;
}

export async function getDocumentBlob(documentId: string) {
  const document = await getDocument(documentId);

  const blob = await prisma.documentBlob.findUnique({
    where: { documentId },
  });
  if (!blob) throw new Error("Document blob not found");

  return { document, data: Buffer.from(blob.data) };
}

export async function listDocuments(ownerType: DocumentOwnerType, ownerId: string) {
  const { user } = await requirePermission("document.view");
  const schoolId = schoolIdFromUser(user);

  await assertOwnerAccess(schoolId, ownerType, ownerId, user);

  return prisma.document.findMany({
    where: { schoolId, ownerType, ownerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      checksum: true,
      createdAt: true,
    },
  });
}

export async function deleteDocument(documentId: string) {
  const { user } = await requirePermission("document.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.document.findFirst({
    where: { id: documentId, schoolId },
  });
  if (!existing) throw new Error("Document not found");

  await assertOwnerAccess(schoolId, existing.ownerType, existing.ownerId, user);

  return prisma.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: documentId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "document",
        entityType: "Document",
        entityId: documentId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

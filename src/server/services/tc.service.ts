import { TCStatus, StudentStatus, Role, EnrollmentStatus, ExitReason } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import { revalidateTag } from "next/cache";
import {
  listTCsSchema,
  generateTCSchema,
  updateTCSchema,
  tcStatusActionSchema,
  type ListTCsInput,
  type GenerateTCInput,
  type UpdateTCInput,
  type TCStatusActionInput,
} from "@/server/validators/tc.validator";

export async function suggestNextTCNumber() {
  const count = await prisma.transferCertificate.count();
  const year = new Date().getFullYear();
  const suggestion = `TC-${year}-${(count + 1).toString().padStart(4, "0")}`;

  // Ensure suggestion is unique, otherwise increment suffix
  let suffix = count + 1;
  let finalSuggestion = suggestion;
  while (true) {
    const existing = await prisma.transferCertificate.findUnique({
      where: { tcNumber: finalSuggestion },
    });
    if (!existing) break;
    suffix++;
    finalSuggestion = `TC-${year}-${suffix.toString().padStart(4, "0")}`;
  }

  return { suggestion: finalSuggestion };
}

export async function listTransferCertificates(input?: ListTCsInput) {
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listTCsSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.classId ? { classId: params.classId } : {}),
    ...(params.sectionId ? { sectionId: params.sectionId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? {
          OR: [
            { tcNumber: { contains: params.search } },
            {
              student: {
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
              },
            },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.transferCertificate.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            admissionNo: true,
            family: {
              select: {
                fatherName: true,
                motherName: true,
                primaryPhone: true,
              },
            },
          },
        },
        class: { select: { name: true } },
        section: { select: { name: true } },
        session: { select: { name: true } },
      },
    }),
    prisma.transferCertificate.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function createTransferCertificateDraft(input: GenerateTCInput) {
  const { user: actor } = await requirePermission("student.create");
  const schoolId = schoolIdFromUser(actor);
  const data = parseOrThrow(generateTCSchema, input);

  // 1. Check if a non-cancelled Transfer Certificate already exists for this student
  const existingTC = await prisma.transferCertificate.findFirst({
    where: {
      studentId: data.studentId,
      status: { in: [TCStatus.DRAFT, TCStatus.ISSUED] },
    },
  });
  if (existingTC) {
    throw new Error(`An active Transfer Certificate (${existingTC.tcNumber}) already exists for this student.`);
  }

  // 2. Load all student, enrollment, and school details for the snapshot
  const student = await prisma.student.findFirst({
    where: { id: data.studentId, schoolId },
    include: { family: true },
  });
  if (!student) throw new Error("Student not found");

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: {
      studentId: data.studentId,
      ...(data.sessionId ? { sessionId: data.sessionId } : {}),
    },
    include: { class: true, section: true, session: true },
    orderBy: { createdAt: "desc" }, // Most recent active enrollment
  });
  if (!enrollment) throw new Error("Student enrollment record not found");

  const branding = await prisma.schoolBranding.findUnique({
    where: { schoolId },
  });

  // Fetch student's exam results / outcomes if available
  const resultOutcomeRecord = await prisma.studentTermResult.findFirst({
    where: { studentId: data.studentId, sessionId: data.sessionId },
    orderBy: { createdAt: "desc" },
  });

  // Suggest a unique TC number
  const { suggestion } = await suggestNextTCNumber();

  // 3. Serialize snapshot data
  const snapshotData = {
    student: {
      fullName: student.fullName,
      admissionNo: student.admissionNo,
      dateOfBirth: student.dateOfBirth?.toISOString() || null,
      gender: student.gender,
      religion: student.religion,
      category: student.category,
      srNo: student.srNo,
      penId: student.penId,
      admissionDate: student.admissionDate?.toISOString() || null,
    },
    family: {
      fatherName: student.family.fatherName,
      motherName: student.family.motherName,
      primaryPhone: student.family.primaryPhone,
    },
    enrollment: {
      class: enrollment.class.name,
      section: enrollment.section.name,
      session: enrollment.session.name,
      rollNo: enrollment.rollNo,
    },
    branding: branding ? {
      schoolName: branding.schoolName,
      address: branding.address,
      phone: branding.phone,
      logoDocumentId: branding.logoDocumentId,
      principalName: branding.principalName,
      principalSignatureDocumentId: branding.principalSignatureDocumentId,
    } : null,
    academic: {
      resultOutcome: resultOutcomeRecord?.resultOutcome || "N/A",
    },
  };

  const tc = await prisma.transferCertificate.create({
    data: {
      tcNumber: suggestion,
      status: TCStatus.DRAFT,
      studentId: data.studentId,
      schoolId,
      sessionId: enrollment.sessionId,
      classId: enrollment.classId,
      sectionId: enrollment.sectionId,
      snapshot: JSON.stringify(snapshotData),
      dateOfIssue: data.dateOfIssue || new Date(),
      attendance: data.attendance || "",
      conduct: data.conduct || "Good",
      remarks: data.remarks || "",
      previousStatus: student.status,
      createdById: actor.id,
    },
  });

  await writeAuditLog({
    schoolId,
    userId: actor.id,
    action: "CREATE",
    module: "student",
    entityType: "TransferCertificate",
    entityId: tc.id,
    newValue: { tcNumber: suggestion, status: "DRAFT" },
  });

  return tc;
}

export async function updateTransferCertificateDraft(input: UpdateTCInput) {
  const { user: actor } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(actor);
  const data = parseOrThrow(updateTCSchema, input);

  const tc = await prisma.transferCertificate.findFirst({
    where: { id: data.tcId, schoolId },
  });
  if (!tc) throw new Error("Transfer Certificate not found");
  if (tc.status !== TCStatus.DRAFT) {
    throw new Error("Only Draft certificates can be updated. Issued or Cancelled certificates are locked.");
  }

  const updated = await prisma.transferCertificate.update({
    where: { id: tc.id },
    data: {
      ...(data.attendance !== undefined ? { attendance: data.attendance } : {}),
      ...(data.conduct !== undefined ? { conduct: data.conduct } : {}),
      ...(data.remarks !== undefined ? { remarks: data.remarks } : {}),
      ...(data.dateOfIssue !== undefined ? { dateOfIssue: data.dateOfIssue } : {}),
      updatedById: actor.id,
    },
  });

  await writeAuditLog({
    schoolId,
    userId: actor.id,
    action: "UPDATE",
    module: "student",
    entityType: "TransferCertificate",
    entityId: tc.id,
    newValue: data,
  });

  return updated;
}

export async function executeTCStatusAction(input: TCStatusActionInput) {
  const { user: actor } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(actor);
  const { tcId, action } = parseOrThrow(tcStatusActionSchema, input);

  const tc = await prisma.transferCertificate.findFirst({
    where: { id: tcId, schoolId },
    include: { student: true },
  });
  if (!tc) throw new Error("Transfer Certificate not found");

  return prisma.$transaction(async (tx) => {
    if (action === "issue") {
      if (tc.status !== TCStatus.DRAFT) {
        throw new Error("Only Draft certificates can be issued.");
      }

      // Update TC Status
      await tx.transferCertificate.update({
        where: { id: tc.id },
        data: { status: TCStatus.ISSUED, updatedById: actor.id },
      });

      // Update student status to LEFT (Transferred)
      await tx.student.update({
        where: { id: tc.studentId },
        data: { status: StudentStatus.LEFT },
      });

      // Create/upsert the StudentExit record to transition them into Former Students
      await tx.studentExit.upsert({
        where: { studentId: tc.studentId },
        create: {
          studentId: tc.studentId,
          leavingDate: tc.dateOfIssue,
          reason: ExitReason.TRANSFERRED,
          tcNumber: tc.tcNumber,
          tcDate: tc.dateOfIssue,
          remarks: tc.remarks,
          createdById: actor.id,
        },
        update: {
          leavingDate: tc.dateOfIssue,
          reason: ExitReason.TRANSFERRED,
          tcNumber: tc.tcNumber,
          tcDate: tc.dateOfIssue,
          remarks: tc.remarks,
          createdById: actor.id,
        },
      });

      // Update current StudentEnrollment status to TRANSFERRED if active
      const currentEnrollment = await tx.studentEnrollment.findFirst({
        where: { studentId: tc.studentId, status: EnrollmentStatus.ACTIVE },
        orderBy: { createdAt: "desc" },
      });
      if (currentEnrollment) {
        await tx.studentEnrollment.update({
          where: { id: currentEnrollment.id },
          data: { status: EnrollmentStatus.TRANSFERRED },
        });
      }

      await writeAuditLog(
        {
          schoolId,
          userId: actor.id,
          action: "TC_ISSUE",
          module: "student",
          entityType: "TransferCertificate",
          entityId: tc.id,
          newValue: { status: "ISSUED" },
        },
        tx,
      );
    } else if (action === "undoIssue") {
      if (tc.status !== TCStatus.ISSUED) {
        throw new Error("Only Issued certificates can be reverted to Draft.");
      }

      // Revert TC Status back to DRAFT
      await tx.transferCertificate.update({
        where: { id: tc.id },
        data: { status: TCStatus.DRAFT, updatedById: actor.id },
      });

      // Restore student status to previous status (or ACTIVE as fallback)
      await tx.student.update({
        where: { id: tc.studentId },
        data: { status: (tc.previousStatus as StudentStatus) || StudentStatus.ACTIVE },
      });

      // Delete the StudentExit record to remove from Former Students
      await tx.studentExit.deleteMany({
        where: { studentId: tc.studentId },
      });

      // Restore the student's TRANSFERRED enrollments back to ACTIVE
      await tx.studentEnrollment.updateMany({
        where: {
          studentId: tc.studentId,
          status: EnrollmentStatus.TRANSFERRED,
        },
        data: { status: EnrollmentStatus.ACTIVE },
      });

      await writeAuditLog(
        {
          schoolId,
          userId: actor.id,
          action: "TC_UNDO_ISSUE",
          module: "student",
          entityType: "TransferCertificate",
          entityId: tc.id,
          newValue: { status: "DRAFT" },
        },
        tx,
      );
    } else if (action === "cancel") {
      if (tc.status !== TCStatus.ISSUED) {
        throw new Error("Only Issued certificates can be cancelled.");
      }

      // Mark TC Status as CANCELLED
      await tx.transferCertificate.update({
        where: { id: tc.id },
        data: { status: TCStatus.CANCELLED, updatedById: actor.id },
      });

      // Restore student status back to previous status
      await tx.student.update({
        where: { id: tc.studentId },
        data: { status: (tc.previousStatus as StudentStatus) || StudentStatus.ACTIVE },
      });

      // Delete the StudentExit record
      await tx.studentExit.deleteMany({
        where: { studentId: tc.studentId },
      });

      // Restore the student's TRANSFERRED enrollments back to ACTIVE
      await tx.studentEnrollment.updateMany({
        where: {
          studentId: tc.studentId,
          status: EnrollmentStatus.TRANSFERRED,
        },
        data: { status: EnrollmentStatus.ACTIVE },
      });

      await writeAuditLog(
        {
          schoolId,
          userId: actor.id,
          action: "TC_CANCEL",
          module: "student",
          entityType: "TransferCertificate",
          entityId: tc.id,
          newValue: { status: "CANCELLED" },
        },
        tx,
      );
    }

    return { success: true };
  });
}

export async function getTransferCertificateDetail(tcId: string) {
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);

  const tc = await prisma.transferCertificate.findFirst({
    where: { id: tcId, schoolId },
    include: {
      student: { include: { family: true } },
      class: true,
      section: true,
      session: true,
    },
  });

  if (!tc) throw new Error("Transfer Certificate not found");
  return tc;
}

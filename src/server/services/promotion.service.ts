import { EnrollmentStatus, ExitReason, PromotionBatchStatus, SessionStatus, StudentStatus } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { requirePermission } from "@/server/permissions/guard";
import { parseOrThrow } from "@/server/validators/common";
import {
  executePromotionSchema,
  getPromotionPreviewSchema,
  undoPromotionSchema,
  type ExecutePromotionInput,
  type GetPromotionPreviewInput,
  type UndoPromotionInput,
} from "@/server/validators/promotion.validator";
import { writeAuditLog } from "@/server/services/audit.service";

export async function getPromotionPreview(input: GetPromotionPreviewInput) {
  const { user } = await requirePermission("session.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(getPromotionPreviewSchema, input);

  const [fromSession, toSession] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.fromSessionId, schoolId } }),
    prisma.academicSession.findFirst({ where: { id: data.toSessionId, schoolId } }),
  ]);
  if (!fromSession || !toSession) throw new Error("Invalid source or target session");

  const warnings: string[] = [];
  if (fromSession.status === SessionStatus.LOCKED) {
    warnings.push("Source academic session is LOCKED. Unlock session before promoting.");
  }
  if (toSession.status === SessionStatus.LOCKED) {
    warnings.push("Target academic session is LOCKED. Unlock session before adding enrollments.");
  }

  // Find all active enrollments in source session matching the requested class mappings
  const mappingPairs = data.classMappings.map((m) => ({
    classId: m.fromClassId,
    sectionId: m.fromSectionId,
  }));

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      sessionId: data.fromSessionId,
      status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PROMOTED, EnrollmentStatus.RETAINED] },
      student: {
        schoolId,
        status: StudentStatus.ACTIVE,
      },
      OR: mappingPairs,
    },
    include: {
      student: { select: { id: true, fullName: true, admissionNo: true, photoUrl: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
    },
    orderBy: [{ classId: "asc" }, { sectionId: "asc" }, { rollNo: "asc" }],
  });

  // Check for existing enrollments in target session for these students
  const studentIds = enrollments.map((e) => e.studentId);
  if (studentIds.length > 0) {
    const existingTargetEnrollmentsCount = await prisma.studentEnrollment.count({
      where: {
        sessionId: data.toSessionId,
        studentId: { in: studentIds },
      },
    });
    if (existingTargetEnrollmentsCount > 0) {
      warnings.push(
        `${existingTargetEnrollmentsCount} student(s) already have an existing enrollment record in the target session (${toSession.name}). Executing promotion will update their target class allocation.`
      );
    }
  }

  const students = enrollments.map((enr) => {
    const mapping = data.classMappings.find(
      (m) => m.fromClassId === enr.classId && m.fromSectionId === enr.sectionId
    );
    // Only mark GRADUATE if the mapping explicitly points to Alumni OR the class name is genuinely "10"
    const isTerminalClass =
      mapping?.toClassId === "ALUMNI" ||
      /(?:^|\s|-)(?:10|x|10th)(?:\s|-|$)/i.test(enr.class.name) ||
      /^10$/.test(enr.class.name.trim());
    const defaultAction: "PROMOTE" | "RETAIN" | "TRANSFER" | "WITHDRAW" | "GRADUATE" = isTerminalClass
      ? "GRADUATE"
      : "PROMOTE";

    const targetClassId = mapping?.toClassId === "ALUMNI" ? enr.classId : (mapping?.toClassId ?? enr.classId);

    return {
      enrollmentId: enr.id,
      studentId: enr.studentId,
      studentName: enr.student.fullName,
      admissionNo: enr.student.admissionNo,
      photoUrl: enr.student.photoUrl,
      currentClassId: enr.classId,
      currentClassName: enr.class.name,
      currentSectionId: enr.sectionId,
      currentSectionName: enr.section.name,
      currentRollNo: enr.rollNo,
      currentHouse: enr.house,
      targetClassId,
      targetSectionId: mapping?.toSectionId ?? enr.sectionId,
      action: defaultAction as "PROMOTE" | "RETAIN" | "TRANSFER" | "WITHDRAW" | "GRADUATE",
    };
  });

  return {
    fromSession: { id: fromSession.id, name: fromSession.name, status: fromSession.status },
    toSession: { id: toSession.id, name: toSession.name, status: toSession.status },
    students,
    summary: {
      totalStudents: students.length,
      toPromoteCount: students.filter((s) => s.action === "PROMOTE").length,
      toRetainCount: students.filter((s) => s.action === "RETAIN").length,
      toTransferCount: students.filter((s) => s.action === "TRANSFER" || s.action === "WITHDRAW").length,
      toGraduateCount: students.filter((s) => s.action === "GRADUATE").length,
      newEnrollmentsCount: students.filter((s) => s.action === "PROMOTE" || s.action === "RETAIN").length,
    },
    warnings,
  };
}

export async function executeBulkPromotion(input: ExecutePromotionInput) {
  const { user } = await requirePermission("session.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(executePromotionSchema, input);

  const [fromSession, toSession] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.fromSessionId, schoolId } }),
    prisma.academicSession.findFirst({ where: { id: data.toSessionId, schoolId } }),
  ]);
  if (!fromSession || !toSession) throw new Error("Invalid source or target session");

  if (fromSession.status === SessionStatus.LOCKED) {
    throw new Error("Cannot promote students from a LOCKED academic session");
  }
  if (toSession.status === SessionStatus.LOCKED) {
    throw new Error("Cannot add enrollments to a LOCKED target academic session");
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create PromotionBatch
    const batch = await tx.promotionBatch.create({
      data: {
        fromSessionId: data.fromSessionId,
        toSessionId: data.toSessionId,
        createdById: user.id,
        status: PromotionBatchStatus.COMPLETED,
      },
    });

    for (const item of data.promotions) {
      // Find current enrollment in source session
      const currentEnr = await tx.studentEnrollment.findUnique({
        where: {
          studentId_sessionId: { studentId: item.studentId, sessionId: data.fromSessionId },
        },
        include: { class: true },
      });

      if (!currentEnr) continue;

      const isClass10 = /\b(10|x|10th)\b/i.test(currentEnr.class.name) || currentEnr.class.name.includes("10") || item.toClassId === "ALUMNI";
      let action = item.action;
      if (isClass10 && action === "PROMOTE") {
        action = "GRADUATE";
      }

      let prevStatus: EnrollmentStatus = EnrollmentStatus.PROMOTED;
      if (action === "RETAIN") prevStatus = EnrollmentStatus.RETAINED;
      if (action === "TRANSFER") prevStatus = EnrollmentStatus.TRANSFERRED;
      if (action === "WITHDRAW") prevStatus = EnrollmentStatus.WITHDRAWN;
      if (action === "GRADUATE") prevStatus = EnrollmentStatus.GRADUATED;

      // Update source session enrollment status
      await tx.studentEnrollment.update({
        where: { id: currentEnr.id },
        data: { status: prevStatus },
      });

      if (action === "GRADUATE") {
        // Set Student.status = LEFT and record StudentExit as GRADUATED (Alumni)
        await tx.student.update({
          where: { id: item.studentId },
          data: { status: StudentStatus.LEFT },
        });
        await tx.studentExit.upsert({
          where: { studentId: item.studentId },
          create: {
            studentId: item.studentId,
            leavingDate: new Date(),
            reason: ExitReason.GRADUATED,
            remarks: "Graduated upon completing Class 10 / final academic level",
            createdById: user.id,
          },
          update: {
            leavingDate: new Date(),
            reason: ExitReason.GRADUATED,
            remarks: "Graduated upon completing Class 10 / final academic level",
            createdById: user.id,
          },
        });
      }

      // If action is PROMOTE or RETAIN, create target session enrollment
      if (action === "PROMOTE" || action === "RETAIN") {
        await tx.studentEnrollment.upsert({
          where: {
            studentId_sessionId: { studentId: item.studentId, sessionId: data.toSessionId },
          },
          create: {
            studentId: item.studentId,
            sessionId: data.toSessionId,
            classId: item.toClassId,
            sectionId: item.toSectionId,
            house: item.targetHouse ?? currentEnr.house,
            status: EnrollmentStatus.ACTIVE,
            promotionBatchId: batch.id,
          },
          update: {
            classId: item.toClassId,
            sectionId: item.toSectionId,
            house: item.targetHouse ?? currentEnr.house,
            status: EnrollmentStatus.ACTIVE,
            promotionBatchId: batch.id,
          },
        });
      }
    }

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "session",
        entityType: "PromotionBatch",
        entityId: batch.id,
        newValue: batch,
      },
      tx
    );

    return batch;
  });
}

export async function undoPromotion(input: UndoPromotionInput) {
  const { user } = await requirePermission("session.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(undoPromotionSchema, input);

  const batch = await prisma.promotionBatch.findFirst({
    where: { id: data.promotionBatchId, fromSession: { schoolId } },
    include: {
      enrollments: true,
      fromSession: true,
      toSession: true,
    },
  });

  if (!batch) throw new Error("Promotion batch not found");
  if (batch.status === PromotionBatchStatus.ROLLED_BACK) {
    throw new Error("This promotion batch has already been rolled back");
  }
  if (batch.toSession.status === SessionStatus.LOCKED) {
    throw new Error("Target academic session is LOCKED. Cannot rollback promotion.");
  }

  const promotedStudentIds = batch.enrollments.map((e) => e.studentId);

  // Check if any academic activity has occurred in the target session for these students
  const [attendanceCount, marksCount, feeAllocationsCount] = await Promise.all([
    prisma.attendanceRecord.count({
      where: { sessionId: batch.toSessionId, studentId: { in: promotedStudentIds } },
    }),
    prisma.markEntry.count({
      where: { studentId: { in: promotedStudentIds }, examSubject: { exam: { sessionId: batch.toSessionId } } },
    }),
    prisma.studentFee.count({
      where: { sessionId: batch.toSessionId, studentId: { in: promotedStudentIds }, allocations: { some: {} } },
    }),
  ]);

  if (attendanceCount > 0 || marksCount > 0 || feeAllocationsCount > 0) {
    throw new Error(
      "Cannot undo promotion: academic activity (attendance, marks, or fee payments) has already been recorded in the target session."
    );
  }

  return prisma.$transaction(async (tx) => {
    // 1. Soft rollback status on batch
    await tx.promotionBatch.update({
      where: { id: batch.id },
      data: { status: PromotionBatchStatus.ROLLED_BACK },
    });

    // 2. Remove enrollments created by this batch in target session
    await tx.studentEnrollment.deleteMany({
      where: { promotionBatchId: batch.id },
    });

    // 3. Restore status on source session enrollments back to ACTIVE
    await tx.studentEnrollment.updateMany({
      where: {
        sessionId: batch.fromSessionId,
        studentId: { in: promotedStudentIds },
      },
      data: { status: EnrollmentStatus.ACTIVE },
    });

    await tx.student.updateMany({
      where: { id: { in: promotedStudentIds }, status: StudentStatus.LEFT },
      data: { status: StudentStatus.ACTIVE },
    });

    await tx.studentExit.deleteMany({
      where: { studentId: { in: promotedStudentIds }, reason: ExitReason.GRADUATED },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "session",
        entityType: "PromotionBatch",
        entityId: batch.id,
        oldValue: { status: batch.status },
        newValue: { status: PromotionBatchStatus.ROLLED_BACK },
      },
      tx
    );

    return { success: true, rolledBackCount: promotedStudentIds.length };
  });
}

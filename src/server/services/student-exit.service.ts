import { EnrollmentStatus, ExitReason, StudentStatus } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { requirePermission } from "@/server/permissions/guard";
import { parseOrThrow } from "@/server/validators/common";
import {
  createStudentExitSchema,
  type CreateStudentExitInput,
} from "@/server/validators/student-exit.validator";
import { writeAuditLog } from "@/server/services/audit.service";

export async function recordStudentExit(input: CreateStudentExitInput) {
  const { user } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createStudentExitSchema, input);

  const student = await prisma.student.findFirst({
    where: { id: data.studentId, schoolId },
    include: { exitInfo: true, enrollments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!student) throw new Error("Student not found");

  const currentEnrollment = student.enrollments[0];

  // Map ExitReason to EnrollmentStatus
  let enrollmentStatus: EnrollmentStatus = EnrollmentStatus.TRANSFERRED;
  if (data.reason === ExitReason.WITHDRAWN) {
    enrollmentStatus = EnrollmentStatus.WITHDRAWN;
  } else if (data.reason === ExitReason.GRADUATED) {
    enrollmentStatus = EnrollmentStatus.GRADUATED;
  } else if (data.reason === ExitReason.EXPELLED) {
    enrollmentStatus = EnrollmentStatus.EXPELLED;
  } else if (data.reason === ExitReason.TRANSFERRED) {
    enrollmentStatus = EnrollmentStatus.TRANSFERRED;
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create or update StudentExit record
    const exitRecord = await tx.studentExit.upsert({
      where: { studentId: data.studentId },
      create: {
        studentId: data.studentId,
        leavingDate: data.leavingDate,
        reason: data.reason,
        tcNumber: data.tcNumber,
        tcDate: data.tcDate,
        remarks: data.remarks,
        createdById: user.id,
      },
      update: {
        leavingDate: data.leavingDate,
        reason: data.reason,
        tcNumber: data.tcNumber,
        tcDate: data.tcDate,
        remarks: data.remarks,
        createdById: user.id,
      },
    });

    // 2. Update Student status to LEFT
    await tx.student.update({
      where: { id: data.studentId },
      data: { status: StudentStatus.LEFT },
    });

    // 3. Update current StudentEnrollment status if active
    if (currentEnrollment && currentEnrollment.status === EnrollmentStatus.ACTIVE) {
      await tx.studentEnrollment.update({
        where: { id: currentEnrollment.id },
        data: { status: enrollmentStatus },
      });
    }

    // 4. Audit Log
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "student",
        entityType: "StudentExit",
        entityId: exitRecord.id,
        newValue: exitRecord,
      },
      tx
    );

    return exitRecord;
  });
}

export async function cancelStudentExit(studentId: string) {
  const { user } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(user);

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
  });
  if (!student) throw new Error("Student not found");

  return prisma.$transaction(async (tx) => {
    // 1. Delete StudentExit record
    await tx.studentExit.deleteMany({ where: { studentId } });

    // 2. Restore Student status to ACTIVE
    await tx.student.update({
      where: { id: studentId },
      data: { status: StudentStatus.ACTIVE },
    });

    // 3. Restore all non-active enrollments back to ACTIVE
    await tx.studentEnrollment.updateMany({
      where: {
        studentId,
        status: { in: [EnrollmentStatus.TRANSFERRED, EnrollmentStatus.WITHDRAWN, EnrollmentStatus.GRADUATED, EnrollmentStatus.EXPELLED] },
      },
      data: { status: EnrollmentStatus.ACTIVE },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "student",
        entityType: "Student",
        entityId: studentId,
        newValue: { status: StudentStatus.ACTIVE, exitCancelled: true },
      },
      tx
    );

    return { success: true };
  });
}

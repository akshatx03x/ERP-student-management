import {
  AdmissionStatus,
  EnrollmentStatus,
  Role,
  StudentStatus,
} from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { attachFeeStructureInTx } from "@/server/services/fee.service";
import {
  buildFullName,
  generateSequentialNo,
  parsePagination,
  schoolIdFromUser,
} from "@/server/lib/helpers";
import { studentDobPassword, studentSyntheticEmail } from "@/lib/utils";
import { parseOrThrow } from "@/server/validators/common";
import {
  createAdmissionSchema,
  listAdmissionsSchema,
  reviewAdmissionSchema,
  updateAdmissionSchema,
  type CreateAdmissionInput,
  type ReviewAdmissionInput,
  type UpdateAdmissionInput,
} from "@/server/validators/admission.validator";

async function generateAdmissionNo(schoolId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.admissionApplication.count({
    where: { session: { schoolId }, admissionNo: { not: null } },
  });
  return generateSequentialNo("ADM", year, count);
}

export async function listAdmissions(input?: {
  page?: number;
  pageSize?: number;
  sessionId?: string;
  status?: AdmissionStatus;
}) {
  const { user } = await requirePermission("admission.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listAdmissionsSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    session: { schoolId },
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.status ? { status: params.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.admissionApplication.findMany({
      where,
      include: {
        session: true,
        appliedClass: true,
        family: true,
        student: { select: { id: true, fullName: true, admissionNo: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.admissionApplication.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getAdmission(admissionId: string) {
  const { user } = await requirePermission("admission.view");
  const schoolId = schoolIdFromUser(user);

  const admission = await prisma.admissionApplication.findFirst({
    where: { id: admissionId, session: { schoolId } },
    include: {
      session: true,
      appliedClass: true,
      family: true,
      student: true,
      reviewedBy: { select: { id: true, name: true } },
    },
  });
  if (!admission) throw new Error("Admission application not found");
  return admission;
}

export async function createAdmission(input: CreateAdmissionInput) {
  const { user } = await requirePermission("admission.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createAdmissionSchema, input);

  const [session, appliedClass] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.class.findFirst({ where: { id: data.appliedClassId, schoolId } }),
  ]);
  if (!session || !appliedClass) throw new Error("Invalid session or class");

  if (data.familyId) {
    const family = await prisma.family.findFirst({
      where: { id: data.familyId, schoolId },
    });
    if (!family) throw new Error("Family not found");
  }

  return prisma.$transaction(async (tx) => {
    const admission = await tx.admissionApplication.create({
      data: {
        sessionId: data.sessionId,
        familyId: data.familyId,
        applicantName: data.applicantName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        appliedClassId: data.appliedClassId,
        fatherName: data.fatherName,
        motherName: data.motherName,
        guardianName: data.guardianName,
        phone: data.phone,
        address: data.address,
        status: AdmissionStatus.PENDING,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "admission",
        entityType: "AdmissionApplication",
        entityId: admission.id,
        newValue: admission,
      },
      tx,
    );

    return admission;
  });
}

export async function updateAdmission(input: UpdateAdmissionInput) {
  const { user } = await requirePermission("admission.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateAdmissionSchema, input);

  const existing = await getAdmission(data.id);
  if (existing.status !== AdmissionStatus.PENDING) {
    throw new Error("Only pending applications can be updated");
  }

  if (data.appliedClassId) {
    const cls = await prisma.class.findFirst({
      where: { id: data.appliedClassId, schoolId },
    });
    if (!cls) throw new Error("Class not found");
  }

  const { id, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.admissionApplication.update({ where: { id }, data: rest });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "admission",
        entityType: "AdmissionApplication",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function approveAdmission(input: ReviewAdmissionInput) {
  const { user } = await requirePermission("admission.approve");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(reviewAdmissionSchema, input);

  const admission = await getAdmission(data.id);
  if (admission.status !== AdmissionStatus.PENDING) {
    throw new Error("Application is not pending");
  }

  const admissionNo = await generateAdmissionNo(schoolId);
  const nameParts = admission.applicantName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? admission.applicantName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
  const fullName = admission.applicantName.trim();

  return prisma.$transaction(async (tx) => {
    let familyId = data.familyId ?? admission.familyId;

    if (!familyId) {
      const family = await tx.family.create({
        data: {
          schoolId,
          fatherName: admission.fatherName,
          motherName: admission.motherName,
          guardianName: admission.guardianName,
          primaryPhone: admission.phone,
          addressLine1: admission.address,
        },
      });
      familyId = family.id;
    }

    const student = await tx.student.create({
      data: {
        schoolId,
        familyId,
        admissionNo,
        firstName,
        lastName,
        fullName,
        dateOfBirth: admission.dateOfBirth,
        gender: admission.gender,
        status: StudentStatus.ACTIVE,
      },
    });

    let sectionId = data.sectionId ?? null;
    if (!sectionId) {
      const firstSection = await tx.section.findFirst({
        where: { classId: admission.appliedClassId },
        orderBy: { name: "asc" },
      });
      if (!firstSection) {
        throw new Error("Applied class has no sections. Create a section before approving.");
      }
      sectionId = firstSection.id;
    }

    const section = await tx.section.findUnique({
      where: { id: sectionId },
      include: { class: true },
    });
    if (!section || section.class.schoolId !== schoolId) {
      throw new Error("Section not found");
    }
    if (section.classId !== admission.appliedClassId) {
      throw new Error("Section does not belong to the applied class");
    }

    await tx.studentEnrollment.create({
      data: {
        studentId: student.id,
        sessionId: admission.sessionId,
        classId: section.classId,
        sectionId: section.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await attachFeeStructureInTx(tx, {
      schoolId,
      studentId: student.id,
      sessionId: admission.sessionId,
      classId: section.classId,
      userId: user.id,
      requireStructure: true,
    });

    const email = studentSyntheticEmail(admissionNo);
    const password = studentDobPassword(admission.dateOfBirth);
    const hashed = await hashPassword(password);

    await tx.user.create({
      data: {
        name: fullName,
        email,
        emailVerified: true,
        role: Role.STUDENT,
        isActive: true,
        mustChangePassword: true,
        loginIdentifier: admissionNo,
        schoolId,
        studentId: student.id,
        accounts: {
          create: {
            accountId: email,
            providerId: "credential",
            password: hashed,
          },
        },
      },
    });

    const updated = await tx.admissionApplication.update({
      where: { id: data.id },
      data: {
        status: AdmissionStatus.APPROVED,
        admissionNo,
        studentId: student.id,
        familyId,
        reviewedById: user.id,
        reviewedAt: new Date(),
        remarks: data.remarks,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "approve",
        module: "admission",
        entityType: "AdmissionApplication",
        entityId: updated.id,
        newValue: { admissionNo, studentId: student.id },
      },
      tx,
    );

    return { admission: updated, student };
  });
}

export async function rejectAdmission(input: ReviewAdmissionInput) {
  const { user } = await requirePermission("admission.approve");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(reviewAdmissionSchema, input);

  const existing = await getAdmission(data.id);
  if (existing.status !== AdmissionStatus.PENDING) {
    throw new Error("Application is not pending");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.admissionApplication.update({
      where: { id: data.id },
      data: {
        status: AdmissionStatus.REJECTED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        remarks: data.remarks,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "reject",
        module: "admission",
        entityType: "AdmissionApplication",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );

    return updated;
  });
}

export async function deleteAdmission(admissionId: string) {
  const { user } = await requirePermission("admission.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await getAdmission(admissionId);
  if (existing.status === AdmissionStatus.APPROVED) {
    throw new Error("Cannot delete an approved admission");
  }

  return prisma.$transaction(async (tx) => {
    await tx.admissionApplication.delete({ where: { id: admissionId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "admission",
        entityType: "AdmissionApplication",
        entityId: admissionId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

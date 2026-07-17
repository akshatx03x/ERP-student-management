import { EnrollmentStatus, Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { attachFeeStructureInTx } from "@/server/services/fee.service";
import { buildFullName, parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import {
  studentDobPassword,
  studentSyntheticEmail,
} from "@/lib/utils";
import { parseOrThrow } from "@/server/validators/common";
import {
  createEnrollmentSchema,
  createStudentSchema,
  createStudentWithFamilySchema,
  listStudentsSchema,
  mergeSiblingsSchema,
  updateEnrollmentSchema,
  updateStudentSchema,
  upsertMedicalSchema,
  type CreateEnrollmentInput,
  type CreateStudentInput,
  type CreateStudentWithFamilyInput,
  type MergeSiblingsInput,
  type UpdateEnrollmentInput,
  type UpdateStudentInput,
  type UpsertMedicalInput,
} from "@/server/validators/student.validator";

export async function createStudentUser(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  student: { id: string; admissionNo: string; fullName: string; dateOfBirth: Date },
  schoolId: string,
) {
  const email = studentSyntheticEmail(student.admissionNo);
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing) throw new Error(`Login already exists for admission no ${student.admissionNo}`);

  const password = studentDobPassword(student.dateOfBirth);
  const hashed = await hashPassword(password);

  const user = await tx.user.create({
    data: {
      name: student.fullName,
      email,
      emailVerified: true,
      role: Role.STUDENT,
      isActive: true,
      mustChangePassword: true,
      loginIdentifier: student.admissionNo,
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

  return user;
}

export async function listStudents(input?: {
  page?: number;
  pageSize?: number;
  search?: string;
  familyId?: string;
  status?: string;
  sessionId?: string;
  classId?: string;
  sectionId?: string;
}) {
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listStudentsSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const enrollmentFilter =
    params.sessionId || params.classId || params.sectionId
      ? {
        some: {
          ...(params.sessionId ? { sessionId: params.sessionId } : {}),
          ...(params.classId ? { classId: params.classId } : {}),
          ...(params.sectionId ? { sectionId: params.sectionId } : {}),
        },
      }
      : undefined;

  const where = {
    schoolId,
    ...(user.role === Role.STUDENT && user.studentId ? { id: user.studentId } : {}),
    ...(params.familyId ? { familyId: params.familyId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(enrollmentFilter ? { enrollments: enrollmentFilter } : {}),
    ...(params.search
      ? {
        OR: [
          { fullName: { contains: params.search, mode: "insensitive" as const } },
          { admissionNo: { contains: params.search, mode: "insensitive" as const } },
          { aadhaar: { contains: params.search } },
        ],
      }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.student.findMany({
      where,
      select: {
        id: true,
        admissionNo: true,
        fullName: true,
        dateOfBirth: true,
        gender: true,
        bloodGroup: true,
        aadhaar: true,
        status: true,
        familyId: true,
        schoolId: true,
        createdAt: true,
        updatedAt: true,
        // Only the 2 fields actually rendered in the list view
        family: {
          select: {
            id: true,
            fatherName: true,
            motherName: true,
            primaryPhone: true,
          },
        },
        // medical excluded: not displayed in the list view
        user: { select: { id: true, email: true, isActive: true } },
        enrollments: {
          include: { class: true, section: true, session: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { fullName: "asc" },
      skip,
      take,
    }),
    prisma.student.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getStudent(studentId: string) {
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);

  if (user.role === Role.STUDENT && user.studentId !== studentId) {
    throw new Error("FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      family: true,
      medical: true,
      user: { select: { id: true, email: true, isActive: true, mustChangePassword: true } },
      enrollments: {
        include: { class: true, section: true, session: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!student) throw new Error("Student not found");

  const siblings = await prisma.student.findMany({
    where: { familyId: student.familyId, id: { not: studentId }, schoolId },
    select: {
      id: true,
      fullName: true,
      admissionNo: true,
      status: true,
      gender: true,
      enrollments: {
        include: { class: true, section: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      studentFees: {
        include: { allocations: true },
      },
    },
    orderBy: { fullName: "asc" },
  });

  return { ...student, siblings };
}

export async function createStudent(input: CreateStudentInput) {
  const { user } = await requirePermission("student.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createStudentSchema, input);

  const family = await prisma.family.findFirst({
    where: { id: data.familyId, schoolId },
  });
  if (!family) throw new Error("Family not found");

  const dup = await prisma.student.findUnique({
    where: { schoolId_admissionNo: { schoolId, admissionNo: data.admissionNo } },
  });
  if (dup) throw new Error(`Admission number "${data.admissionNo}" already exists`);

  const fullName = buildFullName(data.firstName, data.middleName, data.lastName);

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        schoolId,
        familyId: data.familyId,
        admissionNo: data.admissionNo,
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        fullName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        bloodGroup: data.bloodGroup,
        aadhaar: data.aadhaar,
        status: data.status,
      },
    });

    if (data.createLogin) {
      await createStudentUser(tx, student, schoolId);
    }

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "student",
        entityType: "Student",
        entityId: student.id,
        newValue: student,
      },
      tx,
    );

    return student;
  });
}

/**
 * Add a student with parent details on the same form.
 * Creates a new family, or links to an existing one when familyId is provided.
 */
export async function createStudentWithFamily(input: CreateStudentWithFamilyInput) {
  const { user } = await requirePermission("student.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createStudentWithFamilySchema, input);

  if (!data.fatherName && !data.motherName && !data.guardianName) {
    throw new Error("Enter at least one parent or guardian name");
  }

  const dup = await prisma.student.findUnique({
    where: { schoolId_admissionNo: { schoolId, admissionNo: data.admissionNo } },
  });
  if (dup) throw new Error(`Admission number "${data.admissionNo}" already exists`);

  if (data.familyId) {
    const family = await prisma.family.findFirst({
      where: { id: data.familyId, schoolId },
    });
    if (!family) throw new Error("Family not found");
  }

  if (data.enroll && data.sessionId && data.classId && data.sectionId) {
    const [session, cls, section] = await Promise.all([
      prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
      prisma.class.findFirst({ where: { id: data.classId, schoolId } }),
      prisma.section.findFirst({ where: { id: data.sectionId, classId: data.classId } }),
    ]);
    if (!session || !cls || !section) throw new Error("Invalid session, class, or section");
  }

  const fullName = buildFullName(data.firstName, data.middleName, data.lastName);

  return prisma.$transaction(async (tx) => {
    let familyId = data.familyId ?? null;

    if (!familyId) {
      const family = await tx.family.create({
        data: {
          schoolId,
          fatherName: data.fatherName,
          motherName: data.motherName,
          guardianName: data.guardianName,
          primaryPhone: data.phone,
          addressLine1: data.address,
        },
      });
      familyId = family.id;
      await writeAuditLog(
        {
          schoolId,
          userId: user.id,
          action: "create",
          module: "family",
          entityType: "Family",
          entityId: family.id,
          newValue: family,
        },
        tx,
      );
    }

    const student = await tx.student.create({
      data: {
        schoolId,
        familyId,
        admissionNo: data.admissionNo,
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        fullName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        bloodGroup: data.bloodGroup,
        aadhaar: data.aadhaar,
        status: data.status,
      },
    });

    if (data.createLogin) {
      await createStudentUser(tx, student, schoolId);
    }

    if (data.enroll && data.sessionId && data.classId && data.sectionId) {
      await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          sessionId: data.sessionId,
          classId: data.classId,
          sectionId: data.sectionId,
          rollNo: data.rollNo,
          status: EnrollmentStatus.ACTIVE,
        },
      });

      await attachFeeStructureInTx(tx, {
        schoolId,
        studentId: student.id,
        sessionId: data.sessionId,
        classId: data.classId,
        userId: user.id,
        requireStructure: true,
      });
    }

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "student",
        entityType: "Student",
        entityId: student.id,
        newValue: student,
      },
      tx,
    );

    return student;
  });
}

/**
 * Link multiple students to one parent's family (siblings).
 * Keeps the primary student's family; moves others onto it; removes empty leftover families.
 */
export async function mergeSiblings(input: MergeSiblingsInput) {
  const { user } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(mergeSiblingsSchema, input);

  const allIds = Array.from(new Set([data.primaryStudentId, ...data.siblingStudentIds]));
  if (allIds.length < 2) throw new Error("Select at least two students to merge");

  const students = await prisma.student.findMany({
    where: { id: { in: allIds }, schoolId },
    select: { id: true, familyId: true, fullName: true, admissionNo: true },
  });
  if (students.length !== allIds.length) throw new Error("One or more students were not found");

  const primary = students.find((s) => s.id === data.primaryStudentId);
  if (!primary) throw new Error("Primary student not found");

  const targetFamilyId = primary.familyId;
  const oldFamilyIds = Array.from(
    new Set(
      students
        .filter((s) => s.id !== primary.id && s.familyId !== targetFamilyId)
        .map((s) => s.familyId),
    ),
  );

  return prisma.$transaction(async (tx) => {
    await tx.student.updateMany({
      where: {
        id: { in: allIds.filter((id) => id !== primary.id) },
        schoolId,
        familyId: { not: targetFamilyId },
      },
      data: { familyId: targetFamilyId },
    });

    for (const oldId of oldFamilyIds) {
      const remaining = await tx.student.count({ where: { familyId: oldId } });
      if (remaining === 0) {
        const payments = await tx.familyPayment.count({ where: { familyId: oldId } });
        if (payments === 0) {
          await tx.admissionApplication.updateMany({
            where: { familyId: oldId },
            data: { familyId: null },
          });
          await tx.family.delete({ where: { id: oldId } });
        } else {
          // Keep family that has payment history; leave it empty of students.
        }
      }
    }

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "student",
        entityType: "Family",
        entityId: targetFamilyId,
        newValue: {
          mergedStudentIds: allIds,
          primaryStudentId: data.primaryStudentId,
        },
      },
      tx,
    );

    return { familyId: targetFamilyId, studentIds: allIds };
  });
}

export async function updateStudent(input: UpdateStudentInput) {
  const { user } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateStudentSchema, input);

  const existing = await prisma.student.findFirst({
    where: { id: data.id, schoolId },
  });
  if (!existing) throw new Error("Student not found");

  const fullName =
    data.firstName || data.middleName !== undefined || data.lastName !== undefined
      ? buildFullName(
        data.firstName ?? existing.firstName,
        data.middleName !== undefined ? data.middleName : existing.middleName,
        data.lastName !== undefined ? data.lastName : existing.lastName,
      )
      : undefined;

  const { id, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.student.update({
      where: { id },
      data: { ...rest, ...(fullName ? { fullName } : {}) },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "student",
        entityType: "Student",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteStudent(studentId: string) {
  const { user } = await requirePermission("student.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: { user: true },
  });
  if (!existing) throw new Error("Student not found");

  return prisma.$transaction(async (tx) => {
    if (existing.user) {
      await tx.user.delete({ where: { id: existing.user.id } });
    }
    await tx.student.delete({ where: { id: studentId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "student",
        entityType: "Student",
        entityId: studentId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

export async function createEnrollment(input: CreateEnrollmentInput) {
  const { user } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createEnrollmentSchema, input);

  const student = await prisma.student.findFirst({
    where: { id: data.studentId, schoolId },
  });
  if (!student) throw new Error("Student not found");

  const [session, cls, section] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.class.findFirst({ where: { id: data.classId, schoolId } }),
    prisma.section.findFirst({ where: { id: data.sectionId, classId: data.classId } }),
  ]);
  if (!session || !cls || !section) throw new Error("Invalid session, class, or section");

  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.studentEnrollment.upsert({
      where: {
        studentId_sessionId: { studentId: data.studentId, sessionId: data.sessionId },
      },
      create: data,
      update: {
        classId: data.classId,
        sectionId: data.sectionId,
        rollNo: data.rollNo,
        status: data.status,
      },
    });

    await attachFeeStructureInTx(tx, {
      schoolId,
      studentId: data.studentId,
      sessionId: data.sessionId,
      classId: data.classId,
      userId: user.id,
      requireStructure: false,
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "student",
        entityType: "StudentEnrollment",
        entityId: enrollment.id,
        newValue: enrollment,
      },
      tx,
    );
    return enrollment;
  });
}

export async function updateEnrollment(input: UpdateEnrollmentInput) {
  const { user } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateEnrollmentSchema, input);

  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { id: data.id },
    include: { student: true },
  });
  if (!enrollment || enrollment.student.schoolId !== schoolId) {
    throw new Error("Enrollment not found");
  }

  if (data.classId && data.sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: data.sectionId, classId: data.classId },
    });
    if (!section) throw new Error("Section does not belong to the specified class");
  }

  const { id, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.studentEnrollment.update({ where: { id }, data: rest });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "student",
        entityType: "StudentEnrollment",
        entityId: updated.id,
        oldValue: enrollment,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function upsertMedical(input: UpsertMedicalInput) {
  const { user } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(upsertMedicalSchema, input);

  const student = await prisma.student.findFirst({
    where: { id: data.studentId, schoolId },
  });
  if (!student) throw new Error("Student not found");

  const { studentId, ...medicalData } = data;

  return prisma.$transaction(async (tx) => {
    const medical = await tx.studentMedical.upsert({
      where: { studentId },
      create: { studentId, ...medicalData },
      update: medicalData,
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "student",
        entityType: "StudentMedical",
        entityId: medical.id,
        newValue: medical,
      },
      tx,
    );
    return medical;
  });
}

export async function getSiblingsByFamily(familyId: string) {
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);

  const family = await prisma.family.findFirst({ where: { id: familyId, schoolId } });
  if (!family) throw new Error("Family not found");

  return prisma.student.findMany({
    where: { familyId, schoolId },
    include: {
      enrollments: {
        include: { class: true, section: true, session: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { fullName: "asc" },
  });
}

export async function createStudentLogin(studentId: string) {
  const { user } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(user);

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: { user: true },
  });
  if (!student) throw new Error("Student not found");
  if (student.user) throw new Error("Student already has a login account");

  return prisma.$transaction(async (tx) => {
    const account = await createStudentUser(tx, student, schoolId);
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "student",
        entityType: "User",
        entityId: account.id,
        newValue: { studentId, email: account.email },
      },
      tx,
    );
    return account;
  });
}

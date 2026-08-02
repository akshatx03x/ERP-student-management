import { EnrollmentStatus, ExitReason, Role, StudentStatus, Prisma } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { attachFeeStructureInTx } from "@/server/services/fee.service";
import { buildFullName, decimalToNumber, parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
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
  student: { id: string; admissionNo: string; fullName: string; dateOfBirth: Date | null },
  schoolId: string,
  hashedPassword?: string,
) {
  const email = studentSyntheticEmail(student.admissionNo);
  const hashed = hashedPassword ?? await hashPassword(studentDobPassword(student.dateOfBirth));

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
    status: params.status ? (params.status as any) : StudentStatus.ACTIVE,
    ...(enrollmentFilter ? { enrollments: enrollmentFilter } : {}),
    ...(params.search
      ? {
        OR: [
          { fullName: { contains: params.search } },
          { admissionNo: { contains: params.search } },
          { aadhaar: { contains: params.search } },
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
  };

  const [items, total] = await Promise.all([
    prisma.student.findMany({
      where,
      select: {
        id: true,
        admissionNo: true,
        fullName: true,
        photoUrl: true,
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

export async function listFormerStudents(input?: {
  page?: number;
  pageSize?: number;
  search?: string;
  reason?: string;
}) {
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listStudentsSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    status: StudentStatus.LEFT,
    exitInfo: {
      reason: input?.reason && input.reason !== "ALL"
        ? (input.reason as ExitReason)
        : { not: ExitReason.GRADUATED },
    },
    ...(params.search
      ? {
          OR: [
            { fullName: { contains: params.search } },
            { admissionNo: { contains: params.search } },
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
        photoUrl: true,
        dateOfBirth: true,
        gender: true,
        status: true,
        family: { select: { fatherName: true, motherName: true, primaryPhone: true } },
        exitInfo: {
          select: {
            leavingDate: true,
            reason: true,
            tcNumber: true,
            tcDate: true,
            remarks: true,
          },
        },
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

export async function listAlumniStudents(input?: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listStudentsSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    status: StudentStatus.LEFT,
    exitInfo: { reason: ExitReason.GRADUATED },
    ...(params.search
      ? {
          OR: [
            { fullName: { contains: params.search } },
            { admissionNo: { contains: params.search } },
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
        photoUrl: true,
        dateOfBirth: true,
        gender: true,
        status: true,
        family: { select: { fatherName: true, motherName: true, primaryPhone: true } },
        exitInfo: {
          select: {
            leavingDate: true,
            reason: true,
            tcNumber: true,
            tcDate: true,
            remarks: true,
          },
        },
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
      family: {
        include: {
          guardians: true,
        },
      },
      guardians: {
        include: {
          guardian: true,
        },
      },
      medical: true,
      exitInfo: {
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      },
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
        select: {
          amount: true,
          allocations: {
            select: { amount: true },
          },
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const serializedSiblings = siblings.map((sibling) => ({
    ...sibling,
    studentFees: sibling.studentFees.map((fee) => ({
      amount: decimalToNumber(fee.amount),
      allocations: fee.allocations.map((alloc) => ({
        amount: decimalToNumber(alloc.amount),
      })),
    })),
  }));

  return { ...student, siblings: serializedSiblings };
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

  if (!data.allowDuplicate) {
    const existingDuplicate = await prisma.student.findFirst({
      where: {
        schoolId,
        fullName: { equals: fullName },
        dateOfBirth: data.dateOfBirth,
      },
      select: { admissionNo: true },
    });
    if (existingDuplicate) {
      throw new Error(`Student "${fullName}" with this Date of Birth is already registered (Admission No: ${existingDuplicate.admissionNo})`);
    }
  }

  // Compute password hash outside transaction (CPU-bound bcrypt)
  let hashedLoginPassword = "";
  if (data.createLogin) {
    const email = studentSyntheticEmail(data.admissionNo);
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new Error(`Login already exists for admission no ${data.admissionNo}`);

    const password = studentDobPassword(data.dateOfBirth);
    hashedLoginPassword = await hashPassword(password);
  }

  return prisma.$transaction(
    async (tx) => {
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
          religion: data.religion,
          category: data.category,
          apaarId: data.apaarId,
          penId: data.penId,
          previousSchoolName: data.previousSchoolName,
          previousClass: data.previousClass,
          tcNumber: data.tcNumber,
          tcDate: data.tcDate,
          transportRequired: data.transportRequired ?? false,
          transportPickupPoint: data.transportPickupPoint,
          admissionDate: data.admissionDate ?? new Date(),
          photoDocumentId: data.photoDocumentId,
          photoUrl: data.photoUrl,
          status: data.status,
        },
      });

      if (data.createLogin) {
        await createStudentUser(tx, student, schoolId, hashedLoginPassword);
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
    },
    {
      timeout: 25000,
    },
  );
}

/**
 * Add a student with parent details on the same form.
 * Creates a new family, or links to an existing one when familyId is provided.
 */
export async function createStudentWithFamily(
  input: CreateStudentWithFamilyInput,
  outerTx?: Prisma.TransactionClient
) {
  const { user } = await requirePermission("student.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createStudentWithFamilySchema, input);

  if (!data.fatherName && !data.motherName && !data.guardianName) {
    throw new Error("Enter at least one parent or guardian name");
  }

  const client = outerTx || prisma;

  const dup = await client.student.findUnique({
    where: { schoolId_admissionNo: { schoolId, admissionNo: data.admissionNo } },
  });
  if (dup) throw new Error(`Admission number "${data.admissionNo}" already exists`);

  if (data.familyId) {
    const family = await client.family.findFirst({
      where: { id: data.familyId, schoolId },
    });
    if (!family) throw new Error("Family not found");
  }

  if (data.enroll && data.sessionId && data.classId && data.sectionId) {
    const [session, cls, section] = await Promise.all([
      client.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
      client.class.findFirst({ where: { id: data.classId, schoolId } }),
      client.section.findFirst({ where: { id: data.sectionId, classId: data.classId } }),
    ]);
    if (!session || !cls || !section) throw new Error("Invalid session, class, or section");
  }

  const fullName = buildFullName(data.firstName, data.middleName, data.lastName);

  if (!data.allowDuplicate) {
    const existingDuplicate = await client.student.findFirst({
      where: {
        schoolId,
        fullName: { equals: fullName },
        dateOfBirth: data.dateOfBirth,
      },
      select: { admissionNo: true },
    });
    if (existingDuplicate) {
      throw new Error(`Student "${fullName}" with this Date of Birth is already registered (Admission No: ${existingDuplicate.admissionNo})`);
    }
  }

  // Compute password hash outside transaction (CPU-bound bcrypt)
  let hashedLoginPassword = "";
  if (data.createLogin) {
    const email = studentSyntheticEmail(data.admissionNo);
    const existingUser = await client.user.findUnique({ where: { email } });
    if (existingUser) throw new Error(`Login already exists for admission no ${data.admissionNo}`);

    const password = studentDobPassword(data.dateOfBirth);
    hashedLoginPassword = await hashPassword(password);
  }

  const execute = async (tx: Prisma.TransactionClient) => {
    const familyId = data.familyId ?? null;

      const student = await tx.student.create({
        data: {
          admissionNo: data.admissionNo,
          firstName: data.firstName,
          middleName: data.middleName,
          lastName: data.lastName,
          fullName,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          bloodGroup: data.bloodGroup,
          aadhaar: data.aadhaar,
          religion: data.religion,
          category: data.category,
          apaarId: data.apaarId,
          penId: data.penId,
          srNo: data.srNo,
          previousSchoolName: data.previousSchoolName,
          previousClass: data.previousClass,
          previousBoard: data.previousBoard,
          previousReason: data.previousReason,
          tcNumber: data.tcNumber,
          tcDate: data.tcDate,
          transportRequired: data.transportRequired ?? false,
          transportPickupPoint: data.transportPickupPoint,
          transportRoute: data.transportRoute,
          transportVehicle: data.transportVehicle,
          transportDriver: data.transportDriver,
          transportDriverContact: data.transportDriverContact,
          admissionDate: data.admissionDate ?? new Date(),
          photoDocumentId: data.photoDocumentId,
          photoUrl: data.photoUrl,
          status: data.status,
          school: { connect: { id: schoolId } },
          ...(familyId
            ? { family: { connect: { id: familyId } } }
            : {
                family: {
                  create: {
                    school: { connect: { id: schoolId } },
                    fatherName: data.fatherName,
                    motherName: data.motherName,
                    guardianName: data.guardianName,
                    primaryPhone: data.phone,
                    secondaryPhone: data.secondaryPhone,
                    fatherPhotoUrl: data.fatherPhotoUrl,
                    motherPhotoUrl: data.motherPhotoUrl,
                    primaryPhoneBelongsTo: data.primaryPhoneBelongsTo,
                    secondaryPhoneBelongsTo: data.secondaryPhoneBelongsTo,
                    addressLine1: data.resAddressLine1 || data.address,
                    resAddressLine1: data.resAddressLine1 || data.address,
                    resAddressLine2: data.resAddressLine2,
                    resCity: data.resCity,
                    resState: data.resState,
                    resPincode: data.resPincode,
                    sameAsResidential: data.sameAsResidential,
                    permAddressLine1: data.sameAsResidential ? (data.resAddressLine1 || data.address) : data.permAddressLine1,
                    permAddressLine2: data.sameAsResidential ? data.resAddressLine2 : data.permAddressLine2,
                    permCity: data.sameAsResidential ? data.resCity : data.permCity,
                    permState: data.sameAsResidential ? data.resState : data.permState,
                    permPincode: data.sameAsResidential ? data.resPincode : data.permPincode,
                    declarationAccepted: data.declarationAccepted ?? false,
                    declarationDate: data.declarationDate,
                    declarationParentName: data.declarationParentName,
                  },
                },
              }),
        },
        include: {
          family: true,
        },
      });

      const effectiveFamilyId = student.familyId;

      // Create Father Guardian if fatherName provided
      if (data.fatherName) {
        const father = await tx.guardian.create({
          data: {
            schoolId,
            familyId: effectiveFamilyId,
            fullName: data.fatherName,
            gender: "MALE",
            phone: data.fatherPhone || data.phone,
            whatsAppNumber: data.fatherWhatsApp || null,
            photoUrl: data.fatherPhotoUrl || null,
            qualification: data.fatherQualification,
            occupation: data.fatherOccupation,
            designation: data.fatherDesignation,
            annualIncome: data.fatherAnnualIncome,
            officeAddress: data.fatherOfficeAddress,
            aadhaarNumber: data.fatherAadhaar,
            email: data.fatherEmail,
          },
        });
        await tx.studentGuardian.create({
          data: {
            studentId: student.id,
            guardianId: father.id,
            relationshipType: "FATHER",
            isPrimaryContact: true,
            isEmergencyContact: true,
            isFeePayer: true,
          },
        });
      }

      // Create Mother Guardian if motherName provided
      if (data.motherName) {
        const mother = await tx.guardian.create({
          data: {
            schoolId,
            familyId: effectiveFamilyId,
            fullName: data.motherName,
            gender: "FEMALE",
            phone: data.motherPhone,
            whatsAppNumber: data.motherWhatsApp || null,
            photoUrl: data.motherPhotoUrl || null,
            qualification: data.motherQualification,
            isWorking: data.motherIsWorking,
            occupation: data.motherOccupation,
            designation: data.motherDesignation,
            annualIncome: data.motherAnnualIncome,
            officeAddress: data.motherOfficeAddress,
            aadhaarNumber: data.motherAadhaar,
            email: data.motherEmail,
          },
        });
        await tx.studentGuardian.create({
          data: {
            studentId: student.id,
            guardianId: mother.id,
            relationshipType: "MOTHER",
            isPrimaryContact: !data.fatherName,
            isEmergencyContact: true,
            isFeePayer: !data.fatherName,
          },
        });
      }

      // Create Guardian if guardianName provided and no father/mother
      if (data.guardianName && !data.fatherName && !data.motherName) {
        const guardian = await tx.guardian.create({
          data: {
            schoolId,
            familyId: effectiveFamilyId,
            fullName: data.guardianName,
            phone: data.phone,
          },
        });
        await tx.studentGuardian.create({
          data: {
            studentId: student.id,
            guardianId: guardian.id,
            relationshipType: "LEGAL_GUARDIAN",
            isPrimaryContact: true,
            isEmergencyContact: true,
            isFeePayer: true,
          },
        });
      }

      if (!familyId && student.family) {
        await writeAuditLog(
          {
            schoolId,
            userId: user.id,
            action: "create",
            module: "family",
            entityType: "Family",
            entityId: student.family.id,
            newValue: student.family,
          },
          tx,
        );
      }

      if (data.createLogin) {
        await createStudentUser(tx, student, schoolId, hashedLoginPassword);
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
  };

  if (outerTx) {
    return execute(outerTx);
  }
  return prisma.$transaction(execute, { timeout: 25000 });
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

  const {
    id,
    primaryPhone,
    classId,
    sectionId,
    familyId,
    unlinkFamily,
    exitReason,

    fatherName,
    fatherQualification,
    fatherOccupation,
    fatherDesignation,
    fatherAnnualIncome,
    fatherOfficeAddress,
    fatherPhone,
    fatherAadhaar,
    fatherEmail,
    fatherWhatsApp,
    fatherPhotoUrl,

    motherName,
    motherQualification,
    motherIsWorking,
    motherOccupation,
    motherDesignation,
    motherAnnualIncome,
    motherOfficeAddress,
    motherPhone,
    motherAadhaar,
    motherEmail,
    motherWhatsApp,
    motherPhotoUrl,

    primaryPhoneBelongsTo,
    secondaryPhone,
    secondaryPhoneBelongsTo,

    addressLine1,
    addressLine2,
    city,
    state,
    pincode,
    permAddressLine1,
    permAddressLine2,
    permCity,
    permState,
    permPincode,
    sameAsResidential,

    allergies,
    conditions,
    disability,
    emergencyRemarks,

    guardian1Id,
    guardian1Name,
    guardian1Relation,
    guardian1Phone,
    guardian1WhatsApp,
    guardian1Occupation,
    guardian1Address,
    guardian1PhotoUrl,

    guardian2Id,
    guardian2Name,
    guardian2Relation,
    guardian2Phone,
    guardian2WhatsApp,
    guardian2Occupation,
    guardian2Address,
    guardian2PhotoUrl,

    ...rest
  } = data;

  return prisma.$transaction(async (tx) => {
    let targetFamilyId = familyId;

    if (unlinkFamily) {
      const currentFamily = await tx.family.findUnique({
        where: { id: existing.familyId },
        include: { guardians: true },
      });
      if (currentFamily) {
        const newFamily = await tx.family.create({
          data: {
            schoolId,
            fatherName: currentFamily.fatherName,
            motherName: currentFamily.motherName,
            guardianName: currentFamily.guardianName,
            primaryPhone: currentFamily.primaryPhone,
            secondaryPhone: currentFamily.secondaryPhone,
            email: currentFamily.email,
            addressLine1: currentFamily.addressLine1,
            addressLine2: currentFamily.addressLine2,
            city: currentFamily.city,
            state: currentFamily.state,
            pincode: currentFamily.pincode,
            resAddressLine1: currentFamily.resAddressLine1,
            resAddressLine2: currentFamily.resAddressLine2,
            resCity: currentFamily.resCity,
            resState: currentFamily.resState,
            resPincode: currentFamily.resPincode,
            sameAsResidential: currentFamily.sameAsResidential,
            permAddressLine1: currentFamily.permAddressLine1,
            permAddressLine2: currentFamily.permAddressLine2,
            permCity: currentFamily.permCity,
            permState: currentFamily.permState,
            permPincode: currentFamily.permPincode,
            declarationAccepted: currentFamily.declarationAccepted,
            declarationDate: currentFamily.declarationDate,
            declarationParentName: currentFamily.declarationParentName,
          }
        });

        for (const g of currentFamily.guardians) {
          const newG = await tx.guardian.create({
            data: {
              schoolId,
              familyId: newFamily.id,
              fullName: g.fullName,
              gender: g.gender,
              phone: g.phone,
              secondaryPhone: g.secondaryPhone,
              email: g.email,
              qualification: g.qualification,
              isWorking: g.isWorking,
              occupation: g.occupation,
              designation: g.designation,
              annualIncome: g.annualIncome,
              officeAddress: g.officeAddress,
              employerName: g.employerName,
              aadhaarNumber: g.aadhaarNumber,
              panNumber: g.panNumber,
            }
          });

          const oldSg = await tx.studentGuardian.findFirst({
            where: { studentId: id, guardianId: g.id }
          });

          await tx.studentGuardian.create({
            data: {
              studentId: id,
              guardianId: newG.id,
              relationshipType: oldSg?.relationshipType ?? "OTHER",
              isPrimaryContact: oldSg?.isPrimaryContact ?? false,
              isEmergencyContact: oldSg?.isEmergencyContact ?? false,
              isFeePayer: oldSg?.isFeePayer ?? false,
              hasCustody: oldSg?.hasCustody ?? true,
              canPickUp: oldSg?.canPickUp ?? true,
            }
          });
        }

        await tx.studentGuardian.deleteMany({
          where: { studentId: id, guardianId: { in: currentFamily.guardians.map(g => g.id) } }
        });

        targetFamilyId = newFamily.id;
      }
    }

    // Family / Contact / Address fields update
    const familyFieldsToUpdate: any = {};
    if (fatherPhotoUrl !== undefined) familyFieldsToUpdate.fatherPhotoUrl = fatherPhotoUrl;
    if (motherPhotoUrl !== undefined) familyFieldsToUpdate.motherPhotoUrl = motherPhotoUrl;
    if (primaryPhone !== undefined) familyFieldsToUpdate.primaryPhone = primaryPhone;
    if (secondaryPhone !== undefined) familyFieldsToUpdate.secondaryPhone = secondaryPhone;
    if (primaryPhoneBelongsTo !== undefined) familyFieldsToUpdate.primaryPhoneBelongsTo = primaryPhoneBelongsTo;
    if (secondaryPhoneBelongsTo !== undefined) familyFieldsToUpdate.secondaryPhoneBelongsTo = secondaryPhoneBelongsTo;

    if (addressLine1 !== undefined) familyFieldsToUpdate.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) familyFieldsToUpdate.addressLine2 = addressLine2;
    if (city !== undefined) familyFieldsToUpdate.city = city;
    if (state !== undefined) familyFieldsToUpdate.state = state;
    if (pincode !== undefined) familyFieldsToUpdate.pincode = pincode;
    if (permAddressLine1 !== undefined) familyFieldsToUpdate.permAddressLine1 = permAddressLine1;
    if (permAddressLine2 !== undefined) familyFieldsToUpdate.permAddressLine2 = permAddressLine2;
    if (permCity !== undefined) familyFieldsToUpdate.permCity = permCity;
    if (permState !== undefined) familyFieldsToUpdate.permState = permState;
    if (permPincode !== undefined) familyFieldsToUpdate.permPincode = permPincode;
    if (sameAsResidential !== undefined) familyFieldsToUpdate.sameAsResidential = sameAsResidential;

    if (Object.keys(familyFieldsToUpdate).length > 0) {
      await tx.family.update({
        where: { id: existing.familyId },
        data: familyFieldsToUpdate,
      });
    }

    // Update Father Guardian
    if (fatherName !== undefined || fatherPhone !== undefined || fatherWhatsApp !== undefined || fatherEmail !== undefined || fatherOccupation !== undefined || fatherQualification !== undefined || fatherAnnualIncome !== undefined || fatherOfficeAddress !== undefined || fatherAadhaar !== undefined || fatherPhotoUrl !== undefined) {
      const fatherLink = await tx.studentGuardian.findFirst({
        where: { studentId: id, relationshipType: "FATHER" },
        include: { guardian: true }
      });
      const fatherData = {
        fullName: fatherName ?? undefined,
        phone: fatherPhone ?? undefined,
        whatsAppNumber: fatherWhatsApp ?? undefined,
        email: fatherEmail ?? undefined,
        occupation: fatherOccupation ?? undefined,
        qualification: fatherQualification ?? undefined,
        annualIncome: fatherAnnualIncome !== undefined ? (fatherAnnualIncome ? new Prisma.Decimal(fatherAnnualIncome) : null) : undefined,
        officeAddress: fatherOfficeAddress ?? undefined,
        aadhaarNumber: fatherAadhaar ?? undefined,
        photoUrl: fatherPhotoUrl ?? undefined,
      };
      Object.keys(fatherData).forEach(k => (fatherData as any)[k] === undefined && delete (fatherData as any)[k]);

      if (fatherLink) {
        await tx.guardian.update({
          where: { id: fatherLink.guardianId },
          data: fatherData,
        });
      } else if (fatherName) {
        const newFather = await tx.guardian.create({
          data: {
            schoolId,
            familyId: existing.familyId,
            fullName: fatherName,
            gender: "MALE",
            phone: fatherPhone || null,
            whatsAppNumber: fatherWhatsApp || null,
            email: fatherEmail || null,
            occupation: fatherOccupation || null,
            qualification: fatherQualification || null,
            annualIncome: fatherAnnualIncome ? new Prisma.Decimal(fatherAnnualIncome) : null,
            officeAddress: fatherOfficeAddress || null,
            aadhaarNumber: fatherAadhaar || null,
            photoUrl: fatherPhotoUrl || null,
          }
        });
        await tx.studentGuardian.create({
          data: {
            studentId: id,
            guardianId: newFather.id,
            relationshipType: "FATHER",
            isPrimaryContact: true,
            isEmergencyContact: true,
            isFeePayer: true,
          }
        });
      }
    }

    // Update Mother Guardian
    if (motherName !== undefined || motherPhone !== undefined || motherWhatsApp !== undefined || motherEmail !== undefined || motherOccupation !== undefined || motherQualification !== undefined || motherAnnualIncome !== undefined || motherOfficeAddress !== undefined || motherAadhaar !== undefined || motherPhotoUrl !== undefined) {
      const motherLink = await tx.studentGuardian.findFirst({
        where: { studentId: id, relationshipType: "MOTHER" },
        include: { guardian: true }
      });
      const motherData = {
        fullName: motherName ?? undefined,
        phone: motherPhone ?? undefined,
        whatsAppNumber: motherWhatsApp ?? undefined,
        email: motherEmail ?? undefined,
        occupation: motherOccupation ?? undefined,
        qualification: motherQualification ?? undefined,
        annualIncome: motherAnnualIncome !== undefined ? (motherAnnualIncome ? new Prisma.Decimal(motherAnnualIncome) : null) : undefined,
        officeAddress: motherOfficeAddress ?? undefined,
        aadhaarNumber: motherAadhaar ?? undefined,
        photoUrl: motherPhotoUrl ?? undefined,
      };
      Object.keys(motherData).forEach(k => (motherData as any)[k] === undefined && delete (motherData as any)[k]);

      if (motherLink) {
        await tx.guardian.update({
          where: { id: motherLink.guardianId },
          data: motherData,
        });
      } else if (motherName) {
        const newMother = await tx.guardian.create({
          data: {
            schoolId,
            familyId: existing.familyId,
            fullName: motherName,
            gender: "FEMALE",
            phone: motherPhone || null,
            whatsAppNumber: motherWhatsApp || null,
            email: motherEmail || null,
            occupation: motherOccupation || null,
            qualification: motherQualification || null,
            annualIncome: motherAnnualIncome ? new Prisma.Decimal(motherAnnualIncome) : null,
            officeAddress: motherOfficeAddress || null,
            aadhaarNumber: motherAadhaar || null,
            photoUrl: motherPhotoUrl || null,
          }
        });
        await tx.studentGuardian.create({
          data: {
            studentId: id,
            guardianId: newMother.id,
            relationshipType: "MOTHER",
            isPrimaryContact: false,
            isEmergencyContact: true,
            isFeePayer: false,
          }
        });
      }
    }

    // Update Medical details
    if (allergies !== undefined || conditions !== undefined || disability !== undefined || emergencyRemarks !== undefined) {
      const med = await tx.studentMedical.findUnique({ where: { studentId: id } });
      if (med) {
        await tx.studentMedical.update({
          where: { studentId: id },
          data: {
            allergies: allergies !== undefined ? allergies : undefined,
            conditions: conditions !== undefined ? conditions : undefined,
            notes: emergencyRemarks !== undefined ? emergencyRemarks : undefined,
            disability: disability !== undefined ? disability : undefined,
            emergencyRemarks: emergencyRemarks !== undefined ? emergencyRemarks : undefined,
          }
        });
      } else {
        await tx.studentMedical.create({
          data: {
            studentId: id,
            allergies: allergies || null,
            conditions: conditions || null,
            notes: emergencyRemarks || null,
            disability: disability || null,
            emergencyRemarks: emergencyRemarks || null,
          }
        });
      }
    }

    // Update other guardians
    const handleGuardianUpdate = async (
      gId: string | null | undefined,
      name: string | null | undefined,
      relation: string | null | undefined,
      phone: string | null | undefined,
      whatsapp: string | null | undefined,
      occupation: string | null | undefined,
      address: string | null | undefined,
      photoUrl: string | null | undefined,
    ) => {
      if (gId) {
        const updateData: any = {};
        if (name !== undefined) updateData.fullName = name;
        if (phone !== undefined) updateData.phone = phone;
        if (whatsapp !== undefined) updateData.whatsAppNumber = whatsapp;
        if (occupation !== undefined) updateData.occupation = occupation;
        if (address !== undefined) updateData.officeAddress = address;
        if (photoUrl !== undefined) updateData.photoUrl = photoUrl;

        await tx.guardian.update({
          where: { id: gId },
          data: updateData,
        });

        if (relation !== undefined) {
          await tx.studentGuardian.update({
            where: { studentId_guardianId: { studentId: id, guardianId: gId } },
            data: { relationshipType: relation as any },
          });
        }
      } else if (name) {
        const newG = await tx.guardian.create({
          data: {
            schoolId,
            familyId: existing.familyId,
            fullName: name,
            phone: phone || null,
            whatsAppNumber: whatsapp || null,
            occupation: occupation || null,
            officeAddress: address || null,
            photoUrl: photoUrl || null,
          }
        });
        await tx.studentGuardian.create({
          data: {
            studentId: id,
            guardianId: newG.id,
            relationshipType: (relation || "OTHER") as any,
            isPrimaryContact: false,
            isEmergencyContact: false,
            isFeePayer: false,
          }
        });
      }
    };

    if (guardian1Name !== undefined || guardian1Id !== undefined || guardian1PhotoUrl !== undefined) {
      let resolvedG1Id = guardian1Id;
      if (!resolvedG1Id) {
        const gLink = await tx.studentGuardian.findFirst({
          where: {
            studentId: id,
            relationshipType: { notIn: ["FATHER", "MOTHER"] },
          },
          orderBy: { createdAt: "asc" },
        });
        resolvedG1Id = gLink?.guardianId;
      }
      await handleGuardianUpdate(
        resolvedG1Id,
        guardian1Name,
        guardian1Relation,
        guardian1Phone,
        guardian1WhatsApp,
        guardian1Occupation,
        guardian1Address,
        guardian1PhotoUrl,
      );
    }

    if (guardian2Name !== undefined || guardian2Id !== undefined || guardian2PhotoUrl !== undefined) {
      let resolvedG2Id = guardian2Id;
      if (!resolvedG2Id) {
        const gLinks = await tx.studentGuardian.findMany({
          where: {
            studentId: id,
            relationshipType: { notIn: ["FATHER", "MOTHER"] },
          },
          orderBy: { createdAt: "asc" },
        });
        resolvedG2Id = gLinks[1]?.guardianId;
      }
      await handleGuardianUpdate(
        resolvedG2Id,
        guardian2Name,
        guardian2Relation,
        guardian2Phone,
        guardian2WhatsApp,
        guardian2Occupation,
        guardian2Address,
        guardian2PhotoUrl,
      );
    }

    const updated = await tx.student.update({
      where: { id },
      data: {
        ...rest,
        ...(fullName ? { fullName } : {}),
        ...(targetFamilyId !== undefined ? { familyId: targetFamilyId || null } : {}),
      } as any,
    });

    if (classId !== undefined || sectionId !== undefined) {
      const latest = await tx.studentEnrollment.findFirst({
        where: { studentId: id },
        orderBy: { createdAt: "desc" },
      });
      if (latest) {
        await tx.studentEnrollment.update({
          where: { id: latest.id },
          data: {
            classId: classId !== undefined ? (classId || latest.classId) : latest.classId,
            sectionId: sectionId !== undefined ? (sectionId || latest.sectionId) : latest.sectionId,
          },
        });
      }
    }

    if (data.status === StudentStatus.ACTIVE) {
      await tx.studentExit.deleteMany({ where: { studentId: id } });
      await tx.studentEnrollment.updateMany({
        where: {
          studentId: id,
          status: { in: [EnrollmentStatus.TRANSFERRED, EnrollmentStatus.WITHDRAWN, EnrollmentStatus.GRADUATED, EnrollmentStatus.EXPELLED] },
        },
        data: { status: EnrollmentStatus.ACTIVE },
      });
    } else if (data.status === StudentStatus.LEFT) {
      await tx.studentEnrollment.updateMany({
        where: {
          studentId: id,
          status: EnrollmentStatus.ACTIVE,
        },
        data: {
          status:
            exitReason === ExitReason.GRADUATED
              ? EnrollmentStatus.GRADUATED
              : exitReason === ExitReason.EXPELLED
                ? EnrollmentStatus.EXPELLED
                : EnrollmentStatus.WITHDRAWN,
        },
      });

      await tx.studentExit.upsert({
        where: { studentId: id },
        create: {
          studentId: id,
          leavingDate: new Date(),
          reason: exitReason || ExitReason.TRANSFERRED,
          remarks: "Status updated in student edit form",
          tcNumber: rest.tcNumber || null,
        },
        update: {
          reason: exitReason || ExitReason.TRANSFERRED,
          tcNumber: rest.tcNumber || null,
        },
      });
    }

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
  }, { timeout: 20000 });
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

  // Compute password hash outside transaction (CPU-bound bcrypt)
  const password = studentDobPassword(student.dateOfBirth);
  const hashedLoginPassword = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const account = await createStudentUser(tx, student, schoolId, hashedLoginPassword);
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

export async function unlinkStudentFamily(studentId: string) {
  const { user } = await requirePermission("student.update");
  const schoolId = schoolIdFromUser(user);

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
  });
  if (!student) throw new Error("Student not found");
  if (!student.familyId) throw new Error("Student does not belong to any family");

  return prisma.$transaction(async (tx) => {
    const currentFamily = await tx.family.findUnique({
      where: { id: student.familyId },
      include: { guardians: true },
    });
    if (!currentFamily) throw new Error("Family not found");

    const newFamily = await tx.family.create({
      data: {
        schoolId,
        fatherName: currentFamily.fatherName,
        motherName: currentFamily.motherName,
        guardianName: currentFamily.guardianName,
        primaryPhone: currentFamily.primaryPhone,
        secondaryPhone: currentFamily.secondaryPhone,
        email: currentFamily.email,
        addressLine1: currentFamily.addressLine1,
        addressLine2: currentFamily.addressLine2,
        city: currentFamily.city,
        state: currentFamily.state,
        pincode: currentFamily.pincode,
        resAddressLine1: currentFamily.resAddressLine1,
        resAddressLine2: currentFamily.resAddressLine2,
        resCity: currentFamily.resCity,
        resState: currentFamily.resState,
        resPincode: currentFamily.resPincode,
        sameAsResidential: currentFamily.sameAsResidential,
        permAddressLine1: currentFamily.permAddressLine1,
        permAddressLine2: currentFamily.permAddressLine2,
        permCity: currentFamily.permCity,
        permState: currentFamily.permState,
        permPincode: currentFamily.permPincode,
        declarationAccepted: currentFamily.declarationAccepted,
        declarationDate: currentFamily.declarationDate,
        declarationParentName: currentFamily.declarationParentName,
      }
    });

    for (const g of currentFamily.guardians) {
      const newG = await tx.guardian.create({
        data: {
          schoolId,
          familyId: newFamily.id,
          fullName: g.fullName,
          gender: g.gender,
          phone: g.phone,
          secondaryPhone: g.secondaryPhone,
          email: g.email,
          qualification: g.qualification,
          isWorking: g.isWorking,
          occupation: g.occupation,
          designation: g.designation,
          annualIncome: g.annualIncome,
          officeAddress: g.officeAddress,
          employerName: g.employerName,
          aadhaarNumber: g.aadhaarNumber,
          panNumber: g.panNumber,
        }
      });

      const oldSg = await tx.studentGuardian.findFirst({
        where: { studentId: studentId, guardianId: g.id }
      });

      await tx.studentGuardian.create({
        data: {
          studentId: studentId,
          guardianId: newG.id,
          relationshipType: oldSg?.relationshipType ?? "OTHER",
          isPrimaryContact: oldSg?.isPrimaryContact ?? false,
          isEmergencyContact: oldSg?.isEmergencyContact ?? false,
          isFeePayer: oldSg?.isFeePayer ?? false,
          hasCustody: oldSg?.hasCustody ?? true,
          canPickUp: oldSg?.canPickUp ?? true,
        }
      });
    }

    await tx.studentGuardian.deleteMany({
      where: { studentId: studentId, guardianId: { in: currentFamily.guardians.map(g => g.id) } }
    });

    const updated = await tx.student.update({
      where: { id: studentId },
      data: { familyId: newFamily.id },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "student",
        entityType: "Student",
        entityId: studentId,
        oldValue: { familyId: student.familyId },
        newValue: { familyId: newFamily.id },
      },
      tx,
    );

    return updated;
  });
}

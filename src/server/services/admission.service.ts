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
  generateSequentialNo,
  getNextSequenceValue,
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

async function generateAdmissionNoInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  schoolId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const counterId = `admission_no:${schoolId}:${year}`;
  const seqValue = await getNextSequenceValue(tx, counterId);
  return generateSequentialNo("ADM", year, seqValue - 1);
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
      select: {
        id: true,
        applicantName: true,
        dateOfBirth: true,
        gender: true,
        fatherName: true,
        motherName: true,
        guardianName: true,
        phone: true,
        photoUrl: true,
        address: true,
        status: true,
        admissionNo: true,
        remarks: true,
        createdAt: true,
        updatedAt: true,
        session: { select: { id: true, name: true, isCurrent: true } },
        appliedClass: { select: { id: true, name: true } },
        family: { select: { id: true, familyCode: true, fatherName: true, primaryPhone: true } },
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

  if (!data.allowDuplicate) {
    const applicantNameTrimmed = data.applicantName.trim();
    const existingStudent = await prisma.student.findFirst({
      where: {
        schoolId,
        fullName: { equals: applicantNameTrimmed },
        dateOfBirth: data.dateOfBirth,
      },
      select: { admissionNo: true },
    });
    if (existingStudent) {
      throw new Error(`Student "${applicantNameTrimmed}" is already enrolled in the school (Admission No: ${existingStudent.admissionNo}). Duplicate registration is not allowed.`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const admission = await tx.admissionApplication.create({
      data: {
        sessionId: data.sessionId,
        familyId: data.familyId,
        applicantName: data.applicantName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        religion: data.religion,
        category: data.category,
        aadhaar: data.aadhaar,
        apaarId: data.apaarId,
        penId: data.penId,
        srNo: data.srNo,
        appliedClassId: data.appliedClassId,

        fatherName: data.fatherName,
        fatherQualification: data.fatherQualification,
        fatherOccupation: data.fatherOccupation,
        fatherDesignation: data.fatherDesignation,
        fatherAnnualIncome: data.fatherAnnualIncome,
        fatherOfficeAddress: data.fatherOfficeAddress,
        fatherPhone: data.fatherPhone,
        fatherAadhaar: data.fatherAadhaar,
        fatherEmail: data.fatherEmail,

        motherName: data.motherName,
        motherQualification: data.motherQualification,
        motherIsWorking: data.motherIsWorking,
        motherOccupation: data.motherOccupation,
        motherDesignation: data.motherDesignation,
        motherAnnualIncome: data.motherAnnualIncome,
        motherOfficeAddress: data.motherOfficeAddress,
        motherPhone: data.motherPhone,
        motherAadhaar: data.motherAadhaar,
        motherEmail: data.motherEmail,

        guardianName: data.guardianName,
        phone: data.phone,
        address: data.address || data.resAddressLine1,

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

        previousSchoolName: data.previousSchoolName,
        previousClass: data.previousClass,
        tcNumber: data.tcNumber,
        tcDate: data.tcDate,

        transportRequired: data.transportRequired ?? false,
        transportPickupPoint: data.transportPickupPoint,

        declarationAccepted: data.declarationAccepted ?? false,
        declarationDate: data.declarationDate,
        declarationParentName: data.declarationParentName,
        admissionDate: data.admissionDate ?? new Date(),
        admissionNo: data.admissionNo ?? null,
        photoDocumentId: data.photoDocumentId,
        photoUrl: data.photoUrl,

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

  const nameParts = admission.applicantName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? admission.applicantName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
  const fullName = admission.applicantName.trim();

  const existingStudent = await prisma.student.findFirst({
    where: {
      schoolId,
      fullName: { equals: fullName },
      dateOfBirth: admission.dateOfBirth,
    },
    select: { admissionNo: true },
  });
  if (existingStudent) {
    throw new Error(`Student "${fullName}" is already enrolled in the school (Admission No: ${existingStudent.admissionNo}). Cannot approve duplicate admission.`);
  }

  const admissionNo = data.admissionNo?.trim() || admission.admissionNo?.trim();
  if (!admissionNo) {
    throw new Error("Admission number is required for approval");
  }

  const existingDupNo = await prisma.student.findUnique({
    where: { schoolId_admissionNo: { schoolId, admissionNo } },
  });
  if (existingDupNo) {
    throw new Error(`Admission number "${admissionNo}" is already assigned to another student`);
  }

  // Compute password hash outside transaction (CPU-bound bcrypt)
  const tempPassword = studentDobPassword(admission.dateOfBirth);
  const hashed = await hashPassword(tempPassword);

  return prisma.$transaction(async (tx) => {
    const email = studentSyntheticEmail(admissionNo);

    let familyId = data.familyId ?? admission.familyId;

    const student = await tx.student.create({
      data: {
        admissionNo,
        firstName,
        lastName,
        fullName,
        dateOfBirth: admission.dateOfBirth,
        gender: admission.gender,
        religion: admission.religion,
        category: admission.category,
        aadhaar: admission.aadhaar,
        apaarId: admission.apaarId,
        penId: admission.penId,
        srNo: admission.srNo,
        previousSchoolName: admission.previousSchoolName,
        previousClass: admission.previousClass,
        tcNumber: admission.tcNumber,
        tcDate: admission.tcDate,
        transportRequired: admission.transportRequired ?? false,
        transportPickupPoint: admission.transportPickupPoint,
        admissionDate: admission.admissionDate ?? new Date(),
        photoDocumentId: admission.photoDocumentId,
        photoUrl: admission.photoUrl,
        status: StudentStatus.ACTIVE,
        school: { connect: { id: schoolId } },
        ...(familyId
          ? { family: { connect: { id: familyId } } }
          : {
              family: {
                create: {
                  school: { connect: { id: schoolId } },
                  fatherName: admission.fatherName,
                  motherName: admission.motherName,
                  guardianName: admission.guardianName,
                  primaryPhone: admission.phone,
                  addressLine1: admission.resAddressLine1 || admission.address,
                  resAddressLine1: admission.resAddressLine1 || admission.address,
                  resAddressLine2: admission.resAddressLine2,
                  resCity: admission.resCity,
                  resState: admission.resState,
                  resPincode: admission.resPincode,
                  sameAsResidential: admission.sameAsResidential,
                  permAddressLine1: admission.sameAsResidential ? (admission.resAddressLine1 || admission.address) : admission.permAddressLine1,
                  permAddressLine2: admission.sameAsResidential ? admission.resAddressLine2 : admission.permAddressLine2,
                  permCity: admission.sameAsResidential ? admission.resCity : admission.permCity,
                  permState: admission.sameAsResidential ? admission.resState : admission.permState,
                  permPincode: admission.sameAsResidential ? admission.resPincode : admission.permPincode,
                  declarationAccepted: admission.declarationAccepted ?? false,
                  declarationDate: admission.declarationDate,
                  declarationParentName: admission.declarationParentName,
                },
              },
            }),
      },
      include: {
        family: true,
      },
    });

    familyId = student.familyId;

    // Create Father Guardian if fatherName provided
    if (admission.fatherName) {
      const father = await tx.guardian.create({
        data: {
          schoolId,
          familyId,
          fullName: admission.fatherName,
          gender: "MALE",
          phone: admission.fatherPhone || admission.phone,
          qualification: admission.fatherQualification,
          occupation: admission.fatherOccupation,
          designation: admission.fatherDesignation,
          annualIncome: admission.fatherAnnualIncome,
          officeAddress: admission.fatherOfficeAddress,
          aadhaarNumber: admission.fatherAadhaar,
          email: admission.fatherEmail,
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
    if (admission.motherName) {
      const mother = await tx.guardian.create({
        data: {
          schoolId,
          familyId,
          fullName: admission.motherName,
          gender: "FEMALE",
          phone: admission.motherPhone,
          qualification: admission.motherQualification,
          isWorking: admission.motherIsWorking,
          occupation: admission.motherOccupation,
          designation: admission.motherDesignation,
          annualIncome: admission.motherAnnualIncome,
          officeAddress: admission.motherOfficeAddress,
          aadhaarNumber: admission.motherAadhaar,
          email: admission.motherEmail,
        },
      });
      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: mother.id,
          relationshipType: "MOTHER",
          isPrimaryContact: !admission.fatherName,
          isEmergencyContact: true,
          isFeePayer: !admission.fatherName,
        },
      });
    }

    // Create Guardian if guardianName provided
    if (admission.guardianName && !admission.fatherName && !admission.motherName) {
      const guardian = await tx.guardian.create({
        data: {
          schoolId,
          familyId,
          fullName: admission.guardianName,
          phone: admission.phone,
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

    const sectionId = data.sectionId ?? null;
    let section;
    if (sectionId) {
      section = await tx.section.findUnique({
        where: { id: sectionId },
        include: { class: true },
      });
      if (!section || section.class.schoolId !== schoolId) {
        throw new Error("Section not found");
      }
      if (section.classId !== admission.appliedClassId) {
        throw new Error("Section does not belong to the applied class");
      }
    } else {
      section = await tx.section.findFirst({
        where: { classId: admission.appliedClassId, class: { schoolId } },
        include: { class: true },
        orderBy: { name: "asc" },
      });
      if (!section) {
        throw new Error("Applied class has no sections. Create a section before approving.");
      }
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
  }, { timeout: 25000 });
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

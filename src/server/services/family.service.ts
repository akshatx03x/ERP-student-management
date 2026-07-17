import { Prisma } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  createFamilySchema,
  listFamiliesSchema,
  updateFamilySchema,
  type CreateFamilyInput,
  type UpdateFamilyInput,
} from "@/server/validators/family.validator";

export async function listFamilies(input?: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const { user } = await requirePermission("family.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listFamiliesSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    students: { some: {} },
    ...(params.search
      ? {
          OR: [
            { familyCode: { contains: params.search, mode: "insensitive" as const } },
            { fatherName: { contains: params.search, mode: "insensitive" as const } },
            { motherName: { contains: params.search, mode: "insensitive" as const } },
            { guardianName: { contains: params.search, mode: "insensitive" as const } },
            { primaryPhone: { contains: params.search } },
            { email: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.family.findMany({
      where,
      include: {
        _count: { select: { students: true } },
        students: {
          select: { id: true, fullName: true, admissionNo: true },
          orderBy: { fullName: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.family.count({ where }),
  ]);

  return {
    items: items.map((f) => ({
      ...f,
      childrenCount: f._count.students,
      students: f.students,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getFamily(familyId: string) {
  const { user } = await requirePermission("family.view");
  const schoolId = schoolIdFromUser(user);

  const family = await prisma.family.findFirst({
    where: { id: familyId, schoolId },
    include: {
      students: {
        orderBy: { fullName: "asc" },
        include: {
          enrollments: {
            include: { class: true, section: true, session: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
      payments: {
        orderBy: { paidAt: "desc" },
        take: 50,
        include: {
          recordedBy: { select: { id: true, name: true } },
          allocations: {
            include: {
              student: { select: { id: true, fullName: true, admissionNo: true } },
              studentFee: { include: { feeHead: true } },
            },
          },
        },
      },
      _count: { select: { students: true, payments: true } },
    },
  });
  if (!family) throw new Error("Family not found");
  return { ...family, childrenCount: family._count.students };
}

/** Normalize phone to digits for matching (uses last 10 digits). */
function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Find an existing family by parent mobile number (primary identifier).
 * Used during admission to link siblings without manual family selection.
 */
export async function findFamilyByPhone(phone: string) {
  const { user } = await requirePermission("family.view");
  const schoolId = schoolIdFromUser(user);
  const key = phoneKey(phone);
  if (key.length < 10) return null;

  const candidates = await prisma.family.findMany({
    where: {
      schoolId,
      OR: [
        { primaryPhone: { contains: key } },
        { secondaryPhone: { contains: key } },
      ],
    },
    include: {
      students: {
        select: { id: true, fullName: true, admissionNo: true, status: true },
        orderBy: { fullName: "asc" },
      },
    },
    take: 20,
  });

  const match = candidates.find((f) => {
    const primary = f.primaryPhone ? phoneKey(f.primaryPhone) : "";
    const secondary = f.secondaryPhone ? phoneKey(f.secondaryPhone) : "";
    return primary === key || secondary === key;
  });

  return match ?? null;
}

export async function createFamily(input: CreateFamilyInput) {
  const { user } = await requirePermission("family.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createFamilySchema, input);

  if (data.familyCode) {
    const dup = await prisma.family.findUnique({
      where: { schoolId_familyCode: { schoolId, familyCode: data.familyCode } },
    });
    if (dup) throw new Error(`Family code "${data.familyCode}" already exists`);
  }

  return prisma.$transaction(async (tx) => {
    const family = await tx.family.create({
      data: {
        schoolId,
        ...data,
        email: data.email === "" ? null : data.email,
      },
    });
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
    return family;
  });
}

export async function updateFamily(input: UpdateFamilyInput) {
  const { user } = await requirePermission("family.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateFamilySchema, input);

  const existing = await prisma.family.findFirst({
    where: { id: data.id, schoolId },
  });
  if (!existing) throw new Error("Family not found");

  if (data.familyCode && data.familyCode !== existing.familyCode) {
    const dup = await prisma.family.findUnique({
      where: { schoolId_familyCode: { schoolId, familyCode: data.familyCode } },
    });
    if (dup) throw new Error(`Family code "${data.familyCode}" already exists`);
  }

  const { id, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.family.update({
      where: { id },
      data: rest,
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "family",
        entityType: "Family",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteFamily(familyId: string) {
  const { user } = await requirePermission("family.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.family.findFirst({
    where: { id: familyId, schoolId },
    include: {
      students: {
        include: {
          user: true,
        },
      },
      _count: {
        select: {
          payments: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Family not found");

  return prisma.$transaction(async (tx) => {
    // 1. Delete associated users for any students in this family
    const userIds = existing.students.map((s) => s.user?.id).filter(Boolean) as string[];
    if (userIds.length > 0) {
      await tx.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    // 2. Nullify references in AdmissionApplication for both family and students
    const studentIds = existing.students.map((s) => s.id);
    const orConditions: Prisma.AdmissionApplicationWhereInput[] = [{ familyId }];
    if (studentIds.length > 0) {
      orConditions.push({ studentId: { in: studentIds } });
    }
    await tx.admissionApplication.updateMany({
      where: {
        OR: orConditions,
      },
      data: {
        familyId: null,
        studentId: null,
      },
    });

    // 3. Delete the students
    if (studentIds.length > 0) {
      await tx.student.deleteMany({
        where: { id: { in: studentIds } },
      });
    }

    // 4. Delete the family if it has no payments, otherwise clear its personal details (parent history)
    if (existing._count.payments === 0) {
      await tx.family.delete({ where: { id: familyId } });
    } else {
      await tx.family.update({
        where: { id: familyId },
        data: {
          familyCode: null,
          fatherName: null,
          motherName: null,
          guardianName: null,
          primaryPhone: null,
          secondaryPhone: null,
          email: null,
          addressLine1: null,
          addressLine2: null,
          city: null,
          state: null,
          pincode: null,
        },
      });
    }

    // 5. Write audit log
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "family",
        entityType: "Family",
        entityId: familyId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

export async function searchFamilies(query: string, limit = 10) {
  const { user } = await requirePermission("family.view");
  const schoolId = schoolIdFromUser(user);

  return prisma.family.findMany({
    where: {
      schoolId,
      students: { some: {} },
      OR: [
        { familyCode: { contains: query, mode: "insensitive" } },
        { fatherName: { contains: query, mode: "insensitive" } },
        { motherName: { contains: query, mode: "insensitive" } },
        { primaryPhone: { contains: query } },
      ],
    },
    include: { _count: { select: { students: true } } },
    take: limit,
    orderBy: { fatherName: "asc" },
  });
}

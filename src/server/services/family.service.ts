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
      include: { _count: { select: { students: true } } },
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
    include: { _count: { select: { students: true } } },
  });
  if (!existing) throw new Error("Family not found");
  if (existing._count.students > 0) {
    throw new Error("Cannot delete family with linked students");
  }

  return prisma.$transaction(async (tx) => {
    await tx.family.delete({ where: { id: familyId } });
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

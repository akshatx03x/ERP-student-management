import { Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { staffSyntheticEmail } from "@/lib/utils";
import { parseOrThrow } from "@/server/validators/common";
import {
  createStaffLoginSchema,
  createStaffSchema,
  listStaffSchema,
  updateStaffSchema,
  type CreateStaffInput,
  type CreateStaffLoginInput,
  type UpdateStaffInput,
} from "@/server/validators/staff.validator";

async function createStaffUserAccount(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  staff: { id: string; employeeCode: string; fullName: string; role: Role },
  schoolId: string,
  password: string,
) {
  if (staff.role !== Role.ACCOUNTANT && staff.role !== Role.TEACHER) {
    throw new Error("Login can only be created for Accountant or Teacher roles");
  }

  const email = staffSyntheticEmail(staff.employeeCode);
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing) throw new Error(`Login already exists for employee code ${staff.employeeCode}`);

  const hashed = await hashPassword(password);

  return tx.user.create({
    data: {
      name: staff.fullName,
      email,
      emailVerified: true,
      role: staff.role,
      isActive: true,
      mustChangePassword: true,
      loginIdentifier: staff.employeeCode,
      schoolId,
      staffProfileId: staff.id,
      accounts: {
        create: {
          accountId: email,
          providerId: "credential",
          password: hashed,
        },
      },
    },
  });
}

export async function listStaff(input?: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: Role;
  isActive?: boolean;
}) {
  const { user } = await requirePermission("settings.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listStaffSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    ...(params.role ? { role: params.role } : {}),
    ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    ...(params.search
      ? {
          OR: [
            { fullName: { contains: params.search, mode: "insensitive" as const } },
            { employeeCode: { contains: params.search, mode: "insensitive" as const } },
            { designation: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.staffProfile.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, isActive: true, mustChangePassword: true } },
      },
      orderBy: { fullName: "asc" },
      skip,
      take,
    }),
    prisma.staffProfile.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getStaff(staffProfileId: string) {
  const { user } = await requirePermission("settings.view");
  const schoolId = schoolIdFromUser(user);

  const staff = await prisma.staffProfile.findFirst({
    where: { id: staffProfileId, schoolId },
    include: {
      user: { select: { id: true, email: true, isActive: true, mustChangePassword: true } },
      classTeacherAssignments: {
        include: { section: { include: { class: true } }, session: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
  if (!staff) throw new Error("Staff member not found");
  return staff;
}

export async function createStaff(input: CreateStaffInput) {
  const { user } = await requirePermission("user.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createStaffSchema, input);

  const dup = await prisma.staffProfile.findUnique({
    where: { schoolId_employeeCode: { schoolId, employeeCode: data.employeeCode } },
  });
  if (dup) throw new Error(`Employee code "${data.employeeCode}" already exists`);

  return prisma.$transaction(async (tx) => {
    const staff = await tx.staffProfile.create({
      data: {
        schoolId,
        employeeCode: data.employeeCode,
        fullName: data.fullName,
        phone: data.phone,
        designation: data.designation,
        role: data.role,
      },
    });

    if (data.createLogin) {
      const password = data.password ?? `${data.employeeCode}@123`;
      await createStaffUserAccount(tx, staff, schoolId, password);
    }

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "settings",
        entityType: "StaffProfile",
        entityId: staff.id,
        newValue: staff,
      },
      tx,
    );

    return staff;
  });
}

export async function updateStaff(input: UpdateStaffInput) {
  const { user } = await requirePermission("user.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateStaffSchema, input);

  const existing = await prisma.staffProfile.findFirst({
    where: { id: data.id, schoolId },
    include: { user: true },
  });
  if (!existing) throw new Error("Staff member not found");

  const { id, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.staffProfile.update({ where: { id }, data: rest });

    if (rest.isActive === false && existing.user) {
      await tx.user.update({
        where: { id: existing.user.id },
        data: { isActive: false },
      });
    }

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "settings",
        entityType: "StaffProfile",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );

    return updated;
  });
}

export async function deleteStaff(staffProfileId: string) {
  const { user } = await requirePermission("user.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.staffProfile.findFirst({
    where: { id: staffProfileId, schoolId },
    include: { user: true },
  });
  if (!existing) throw new Error("Staff member not found");
  if (existing.role === Role.PRINCIPAL) throw new Error("Cannot delete principal account");

  return prisma.$transaction(async (tx) => {
    if (existing.user) {
      await tx.user.delete({ where: { id: existing.user.id } });
    }
    await tx.staffProfile.delete({ where: { id: staffProfileId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "settings",
        entityType: "StaffProfile",
        entityId: staffProfileId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

export async function createStaffLogin(input: CreateStaffLoginInput) {
  const { user } = await requirePermission("user.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createStaffLoginSchema, input);

  const staff = await prisma.staffProfile.findFirst({
    where: { id: data.staffProfileId, schoolId },
    include: { user: true },
  });
  if (!staff) throw new Error("Staff member not found");
  if (staff.user) throw new Error("Staff member already has a login account");

  const password = data.password ?? `${staff.employeeCode}@123`;

  return prisma.$transaction(async (tx) => {
    const account = await createStaffUserAccount(tx, staff, schoolId, password);
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "settings",
        entityType: "User",
        entityId: account.id,
        newValue: { staffProfileId: staff.id, email: account.email },
      },
      tx,
    );
    return account;
  });
}

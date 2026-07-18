import { Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import { revalidateTag } from "next/cache";
import {
  listUsersSchema,
  toggleUserActiveSchema,
  updateUserPermissionsSchema,
  type ToggleUserActiveInput,
  type UpdateUserPermissionsInput,
} from "@/server/validators/settings.validator";
import { PERMISSION_RESOURCES, PERMISSION_ACTIONS, permissionKey } from "@/config/permissions";

export async function listUsers(input?: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
}) {
  const { user } = await requirePermission("user.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listUsersSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    ...(params.role ? { role: params.role as Role } : {}),
    ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" as const } },
            { email: { contains: params.search, mode: "insensitive" as const } },
            { loginIdentifier: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        loginIdentifier: true,
        mustChangePassword: true,
        staffProfile: { select: { employeeCode: true, designation: true } },
        student: { select: { admissionNo: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function listPermissionCatalog() {
  await requirePermission("permission.view");
  return prisma.permission.findMany({
    orderBy: [{ resource: "asc" }, { action: "asc" }],
  });
}

export async function getUserPermissionOverrides(userId: string) {
  await requirePermission("permission.view");
  return prisma.userPermission.findMany({
    where: { userId },
    include: { permission: true },
  });
}

export async function updateUserPermissions(input: UpdateUserPermissionsInput) {
  const { user: actor } = await requirePermission("permission.update");
  const schoolId = schoolIdFromUser(actor);
  const data = parseOrThrow(updateUserPermissionsSchema, input);

  const target = await prisma.user.findFirst({
    where: { id: data.userId, schoolId },
  });
  if (!target) throw new Error("User not found");
  if (target.role === Role.PRINCIPAL) {
    throw new Error("Principal permissions cannot be overridden");
  }
  if (target.role === Role.STUDENT) {
    throw new Error("Student write permissions cannot be granted");
  }

  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((p) => [p.key, p]));

  await prisma.$transaction(async (tx) => {
    for (const item of data.permissions) {
      const permission = byKey.get(item.permissionKey);
      if (!permission) continue;

      await tx.userPermission.upsert({
        where: {
          userId_permissionId: {
            userId: data.userId,
            permissionId: permission.id,
          },
        },
        create: {
          userId: data.userId,
          permissionId: permission.id,
          allowed: item.allowed,
        },
        update: { allowed: item.allowed },
      });
    }

    await writeAuditLog(
      {
        schoolId,
        userId: actor.id,
        action: "UPDATE",
        module: "permission",
        entityType: "UserPermission",
        entityId: data.userId,
        newValue: data.permissions,
      },
      tx,
    );
  });

  return { ok: true };
}

export async function toggleUserActive(input: ToggleUserActiveInput) {
  const { user: actor } = await requirePermission("user.update");
  const schoolId = schoolIdFromUser(actor);
  const data = parseOrThrow(toggleUserActiveSchema, input);

  const target = await prisma.user.findFirst({
    where: { id: data.userId, schoolId },
  });
  if (!target) throw new Error("User not found");
  if (target.id === actor.id) throw new Error("You cannot deactivate yourself");
  if (target.role === Role.PRINCIPAL && !data.isActive) {
    throw new Error("Cannot deactivate the principal account");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id: target.id },
      data: { isActive: data.isActive },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: actor.id,
        action: data.isActive ? "ACTIVATE" : "DEACTIVATE",
        module: "user",
        entityType: "User",
        entityId: target.id,
        oldValue: { isActive: target.isActive },
        newValue: { isActive: data.isActive },
      },
      tx,
    );
    return result;
  });

  revalidateTag(`user-${target.id}`);

  return updated;
}

export function allPermissionKeys() {
  return PERMISSION_RESOURCES.flatMap((resource) =>
    PERMISSION_ACTIONS.map((action) => permissionKey(resource, action)),
  );
}

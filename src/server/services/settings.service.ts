import { Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import { revalidateTag } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import {
  listUsersSchema,
  toggleUserActiveSchema,
  updateUserPermissionsSchema,
  type ToggleUserActiveInput,
  type UpdateUserPermissionsInput,
} from "@/server/validators/settings.validator";
import {
  PERMISSION_RESOURCES,
  PERMISSION_ACTIONS,
  PERMISSION_PRESETS,
  permissionKey,
  type PermissionKey,
} from "@/config/permissions";

export function validatePasswordStrength(password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    throw new Error("Password must contain at least one number");
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new Error("Password must contain at least one special character");
  }
}

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
    staffProfileId: { not: null },
    ...(user.role !== Role.DEVELOPER ? { role: { not: Role.DEVELOPER } } : {}),
    ...(params.role ? { role: params.role as Role } : {}),
    ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search } },
            { email: { contains: params.search } },
            { loginIdentifier: { contains: params.search } },
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
        staffProfileId: true,
        staffProfile: { select: { id: true, employeeCode: true, designation: true } },
        student: { select: { admissionNo: true } },
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, ipAddress: true, userAgent: true },
        },
        auditLogs: {
          where: { action: "CREATE_USER" },
          take: 1,
          select: {
            user: { select: { name: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const mappedItems = items.map((item) => {
    const creator = item.auditLogs[0]?.user?.name || "System";
    const lastSession = item.sessions[0];
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      role: item.role,
      isActive: item.isActive,
      loginIdentifier: item.loginIdentifier,
      mustChangePassword: item.mustChangePassword,
      staffProfile: item.staffProfile,
      student: item.student,
      createdBy: creator,
      lastLogin: lastSession ? lastSession.createdAt : null,
    };
  });

  return { items: mappedItems, total, page, pageSize };
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  designation: string;
  role: Role;
  presetId?: string;
}) {
  const { user: actor } = await requirePermission("user.create");
  const schoolId = schoolIdFromUser(actor);

  // Protected roles cannot be created via user management
  if (input.role === Role.PRINCIPAL || input.role === Role.DEVELOPER) {
    throw new Error("System administrator roles cannot be created via User Management");
  }

  const trimmedEmail = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
  if (existing) {
    throw new Error("Email already exists");
  }

  validatePasswordStrength(input.password);
  const hashedPassword = await hashPassword(input.password);

  // Resolve preset permissions if a preset was selected
  let presetPermissionKeys: PermissionKey[] = [];
  if (input.presetId) {
    const preset = PERMISSION_PRESETS.find((p) => p.id === input.presetId);
    if (preset) {
      presetPermissionKeys = preset.permissions;
    }
  }

  return prisma.$transaction(async (tx) => {
    const employeeCode = `EMP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const staff = await tx.staffProfile.create({
      data: {
        schoolId,
        fullName: input.name,
        employeeCode,
        designation: input.designation || null,
        role: input.role,
        isActive: true,
      },
    });

    const user = await tx.user.create({
      data: {
        schoolId,
        name: input.name,
        email: trimmedEmail,
        emailVerified: true,
        role: input.role,
        isActive: true,
        mustChangePassword: false,
        loginIdentifier: trimmedEmail,
        staffProfileId: staff.id,
        accounts: {
          create: {
            accountId: trimmedEmail,
            providerId: "credential",
            password: hashedPassword,
          },
        },
      },
    });

    // Apply preset permissions as initial UserPermission overrides
    if (presetPermissionKeys.length > 0) {
      const permissions = await tx.permission.findMany({
        where: { key: { in: presetPermissionKeys } },
      });
      for (const permission of permissions) {
        await tx.userPermission.create({
          data: {
            userId: user.id,
            permissionId: permission.id,
            allowed: true,
          },
        });
      }
    }

    await writeAuditLog(
      {
        schoolId,
        userId: actor.id,
        action: "CREATE_USER",
        module: "user",
        entityType: "User",
        entityId: user.id,
        newValue: { email: trimmedEmail, role: input.role, preset: input.presetId },
      },
      tx,
    );

    return user;
  });
}

export async function resetUserPassword(input: {
  userId: string;
  password: string;
}) {
  const { user: actor } = await requirePermission("user.update");
  const schoolId = schoolIdFromUser(actor);

  const target = await prisma.user.findFirst({
    where: { id: input.userId, schoolId },
  });
  if (!target) {
    throw new Error("User not found");
  }

  validatePasswordStrength(input.password);
  const hashedPassword = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findFirst({
      where: { userId: target.id, providerId: "credential" },
    });
    if (account) {
      await tx.account.update({
        where: { id: account.id },
        data: { password: hashedPassword },
      });
    } else {
      await tx.account.create({
        data: {
          userId: target.id,
          providerId: "credential",
          accountId: target.email,
          password: hashedPassword,
        },
      });
    }

    await writeAuditLog(
      {
        schoolId,
        userId: actor.id,
        action: "PASSWORD_RESET",
        module: "user",
        entityType: "User",
        entityId: target.id,
        newValue: { email: target.email },
      },
      tx,
    );
  });

  return { success: true };
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
  if (target.role === Role.PRINCIPAL || target.role === Role.DEVELOPER) {
    throw new Error("System administrators' permissions cannot be overridden");
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
  
  if (target.role === Role.DEVELOPER) {
    throw new Error("Developer account cannot be deactivated");
  }

  if (target.role === Role.PRINCIPAL && !data.isActive) {
    const activePrincipalsCount = await prisma.user.count({
      where: { schoolId, role: Role.PRINCIPAL, isActive: true },
    });
    if (activePrincipalsCount <= 1) {
      throw new Error("Cannot deactivate the last active Principal account");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id: target.id },
      data: { isActive: data.isActive },
    });
    
    if (!data.isActive) {
      await tx.session.deleteMany({
        where: { userId: target.id },
      });
    }

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

export async function updateUserCredentials(input: {
  userId: string;
  loginIdentifier: string;
}) {
  const { user: actor } = await requirePermission("user.update");
  const schoolId = schoolIdFromUser(actor);

  const target = await prisma.user.findFirst({
    where: { id: input.userId, schoolId },
  });
  if (!target) throw new Error("User not found");

  const newLoginId = input.loginIdentifier.trim();
  if (!newLoginId) throw new Error("Login ID cannot be empty");

  // Keep synthetic format or direct email
  const newEmail = newLoginId.includes("@") ? newLoginId : `${newLoginId.toLowerCase()}@vidyanjali.edu.in`;

  // Check if taken
  const existing = await prisma.user.findFirst({
    where: {
      email: newEmail,
      id: { not: target.id },
    },
  });
  if (existing) throw new Error("This Login ID is already in use by another user");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: {
        email: newEmail,
        loginIdentifier: newLoginId,
      },
    });

    await tx.account.updateMany({
      where: { userId: target.id, providerId: "credential" },
      data: { accountId: newEmail },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: actor.id,
        action: "UPDATE",
        module: "user",
        entityType: "User",
        entityId: target.id,
        newValue: { loginIdentifier: newLoginId, email: newEmail },
      },
      tx,
    );
  });

  revalidateTag(`user-${target.id}`);
  return { success: true };
}

export function allPermissionKeys() {
  return PERMISSION_RESOURCES.flatMap((resource) =>
    PERMISSION_ACTIONS.map((action) => permissionKey(resource, action)),
  );
}

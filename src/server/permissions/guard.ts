import { cache } from "react";
import type { Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import {
  type PermissionKey,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  ROLE_DEFAULT_PERMISSIONS,
  permissionKey,
} from "@/config/permissions";
import { getCurrentUser, isPrincipal } from "@/server/auth/session";

/**
 * Cached per-request permission resolver.
 * React cache() deduplicates calls with identical (userId, role) within the
 * same request — the layout, the page, and the service all share one result.
 */
export const resolveEffectivePermissions = cache(async function resolveEffectivePermissions(
  userId: string,
  role: Role,
): Promise<Set<PermissionKey>> {
  const t0 = process.env.NODE_ENV === "development" ? performance.now() : 0;

  if (isPrincipal(role)) {
    const all = new Set<PermissionKey>();
    for (const resource of PERMISSION_RESOURCES) {
      for (const action of PERMISSION_ACTIONS) {
        all.add(permissionKey(resource, action));
      }
    }
    if (process.env.NODE_ENV === "development") {
      console.log(`[perf] resolveEffectivePermissions (PRINCIPAL, no DB): ${(performance.now() - t0).toFixed(1)}ms`);
    }
    return all;
  }

  const [rolePerms, overrides] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { role, allowed: true },
      include: { permission: true },
    }),
    prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
    }),
  ]);

  if (process.env.NODE_ENV === "development") {
    console.log(`[perf] resolveEffectivePermissions (DB parallel): ${(performance.now() - t0).toFixed(1)}ms`);
  }

  const map = new Map<string, boolean>();
  for (const rp of rolePerms) {
    map.set(rp.permission.key, true);
  }
  for (const ov of overrides) {
    map.set(ov.permission.key, ov.allowed);
  }

  const effective = new Set<PermissionKey>();
  for (const [key, allowed] of map) {
    if (allowed) effective.add(key as PermissionKey);
  }

  if (role === "STUDENT") {
    const writeActions = new Set(["create", "update", "delete", "import", "approve"]);
    for (const key of [...effective]) {
      const action = key.split(".")[1];
      if (writeActions.has(action) && !key.startsWith("leave.")) {
        effective.delete(key);
      }
    }
  }

  return effective;
});

export async function requirePermission(key: PermissionKey) {
  const user = await getCurrentUser();
  if (user.mustChangePassword && user.role === "STUDENT") {
    throw new Error("PASSWORD_CHANGE_REQUIRED");
  }
  const perms = await resolveEffectivePermissions(user.id, user.role);
  if (!perms.has(key)) {
    throw new Error("FORBIDDEN");
  }
  return { user, permissions: perms };
}

export async function hasPermission(key: PermissionKey) {
  const user = await getCurrentUser();
  const perms = await resolveEffectivePermissions(user.id, user.role);
  return perms.has(key);
}

export async function ensurePermissionCatalog() {
  for (const resource of PERMISSION_RESOURCES) {
    for (const action of PERMISSION_ACTIONS) {
      const key = permissionKey(resource, action);
      await prisma.permission.upsert({
        where: { key },
        create: {
          resource,
          action,
          key,
          description: `${action} ${resource}`,
        },
        update: {},
      });
    }
  }
}

export async function seedRoleDefaults() {
  await ensurePermissionCatalog();
  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((p) => [p.key, p]));

  for (const [role, keys] of Object.entries(ROLE_DEFAULT_PERMISSIONS) as [
    "ACCOUNTANT" | "TEACHER" | "STUDENT",
    PermissionKey[],
  ][]) {
    for (const key of keys) {
      const permission = byKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          role_permissionId: { role, permissionId: permission.id },
        },
        create: { role, permissionId: permission.id, allowed: true },
        update: { allowed: true },
      });
    }
  }
}

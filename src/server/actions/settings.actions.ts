"use server";

import { revalidatePath } from "next/cache";
import { updateBranding } from "@/server/services/branding.service";
import {
  listUsers,
  listPermissionCatalog,
  getUserPermissionOverrides,
  updateUserPermissions,
  toggleUserActive,
} from "@/server/services/settings.service";
import type { UpdateBrandingInput } from "@/server/validators/branding.validator";
import type {
  ToggleUserActiveInput,
  UpdateUserPermissionsInput,
} from "@/server/validators/settings.validator";

export async function getUsersAction(input?: Parameters<typeof listUsers>[0]) {
  return listUsers(input);
}

export async function getPermissionCatalogAction() {
  return listPermissionCatalog();
}

export async function getUserOverridesAction(userId: string) {
  return getUserPermissionOverrides(userId);
}

export async function updatePermissionsAction(input: UpdateUserPermissionsInput) {
  const result = await updateUserPermissions(input);
  revalidatePath("/settings");
  return result;
}

export async function toggleUserActiveAction(input: ToggleUserActiveInput) {
  const result = await toggleUserActive(input);
  revalidatePath("/settings");
  return result;
}

export async function updateBrandingAction(input: UpdateBrandingInput) {
  const result = await updateBranding(input);
  revalidatePath("/settings");
  return result;
}

export async function getBrandingAction() {
  const { getSchoolBranding } = await import("@/server/services/branding.service");
  return getSchoolBranding();
}

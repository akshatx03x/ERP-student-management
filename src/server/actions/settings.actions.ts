"use server";

import { revalidatePath } from "next/cache";
import { updateBranding } from "@/server/services/branding.service";
import {
  listUsers,
  listPermissionCatalog,
  getUserPermissionOverrides,
  updateUserPermissions,
  toggleUserActive,
  createUser,
  resetUserPassword,
  updateUserCredentials,
} from "@/server/services/settings.service";
import type { UpdateBrandingInput } from "@/server/validators/branding.validator";
import type {
  ToggleUserActiveInput,
  UpdateUserPermissionsInput,
  CreateUserInput,
  ResetUserPasswordInput,
  UpdateUserCredentialsInput,
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

export async function createUserAction(input: CreateUserInput) {
  const result = await createUser(input);
  revalidatePath("/settings");
  return result;
}

export async function resetUserPasswordAction(input: ResetUserPasswordInput) {
  const result = await resetUserPassword(input);
  revalidatePath("/settings");
  return result;
}

export async function updateUserCredentialsAction(input: UpdateUserCredentialsInput) {
  const result = await updateUserCredentials(input);
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

export async function createStaffSettingsAction(input: any) {
  const { createStaff } = await import("@/server/services/staff.service");
  const result = await createStaff(input);
  revalidatePath("/settings");
  return result;
}

export async function updateStaffSettingsAction(input: any) {
  const { updateStaff } = await import("@/server/services/staff.service");
  const result = await updateStaff(input);
  revalidatePath("/settings");
  return result;
}

export async function deleteStaffSettingsAction(id: string) {
  const { deleteStaff } = await import("@/server/services/staff.service");
  const result = await deleteStaff(id);
  revalidatePath("/settings");
  return result;
}

export async function createStaffLoginSettingsAction(input: any) {
  const { createStaffLogin } = await import("@/server/services/staff.service");
  const result = await createStaffLogin(input);
  revalidatePath("/settings");
  return result;
}

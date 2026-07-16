"use server";

import { revalidatePath } from "next/cache";
import {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  createStaffLogin,
} from "@/server/services/staff.service";
import type {
  CreateStaffInput,
  UpdateStaffInput,
  CreateStaffLoginInput,
} from "@/server/validators/staff.validator";

export async function listStaffAction(input?: Parameters<typeof listStaff>[0]) {
  return listStaff(input);
}

export async function getStaffAction(id: string) {
  return getStaff(id);
}

export async function createStaffAction(input: CreateStaffInput) {
  const result = await createStaff(input);
  revalidatePath("/staff");
  return result;
}

export async function updateStaffAction(input: UpdateStaffInput) {
  const result = await updateStaff(input);
  revalidatePath("/staff");
  revalidatePath(`/staff/${input.id}`);
  return result;
}

export async function deleteStaffAction(id: string) {
  const result = await deleteStaff(id);
  revalidatePath("/staff");
  return result;
}

export async function createStaffLoginAction(input: CreateStaffLoginInput) {
  const result = await createStaffLogin(input);
  revalidatePath("/staff");
  revalidatePath(`/staff/${input.staffProfileId}`);
  return result;
}

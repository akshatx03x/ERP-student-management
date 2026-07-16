"use server";

import { revalidatePath } from "next/cache";
import {
  listFamilies,
  getFamily,
  createFamily,
  updateFamily,
  deleteFamily,
  findFamilyByPhone,
} from "@/server/services/family.service";
import type { CreateFamilyInput, UpdateFamilyInput } from "@/server/validators/family.validator";

export async function listFamiliesAction(input?: { page?: number; pageSize?: number; search?: string }) {
  return listFamilies(input);
}

export async function getFamilyAction(id: string) {
  return getFamily(id);
}

export async function findFamilyByPhoneAction(phone: string) {
  return findFamilyByPhone(phone);
}

export async function createFamilyAction(input: CreateFamilyInput) {
  const result = await createFamily(input);
  revalidatePath("/families");
  return result;
}

export async function updateFamilyAction(input: UpdateFamilyInput) {
  const result = await updateFamily(input);
  revalidatePath("/families");
  revalidatePath(`/families/${input.id}`);
  return result;
}

export async function deleteFamilyAction(id: string) {
  await deleteFamily(id);
  revalidatePath("/families");
}

"use server";

import { revalidatePath } from "next/cache";
import {
  createFeeDiscount,
  listStudentDiscounts,
  revokeFeeDiscount,
} from "@/server/services/discount.service";
import type {
  CreateFeeDiscountInput,
  ListStudentDiscountsInput,
  RevokeFeeDiscountInput,
} from "@/server/validators/discount.validator";

export async function createFeeDiscountAction(input: CreateFeeDiscountInput) {
  const res = await createFeeDiscount(input);
  revalidatePath("/fees");
  revalidatePath(`/students/${input.studentId}`);
  return {
    success: true,
    discountId: res.discount.id,
    affectedFeesCount: res.affectedFeesCount,
    retrospectiveCreditAmount: Number(res.retrospectiveCreditAmount.toString()),
  };
}

export async function revokeFeeDiscountAction(input: RevokeFeeDiscountInput) {
  const res = await revokeFeeDiscount(input);
  revalidatePath("/fees");
  revalidatePath(`/students/${res.studentId}`);
  return { success: true, discountId: res.id, status: res.status };
}

export async function listStudentDiscountsAction(input: ListStudentDiscountsInput) {
  return listStudentDiscounts(input);
}

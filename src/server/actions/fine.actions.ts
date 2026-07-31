"use server";

import { revalidatePath } from "next/cache";
import {
  createFeeLateRule,
  listFeeLateRules,
  waiveStudentFine,
} from "@/server/services/fine.service";
import type {
  CreateFeeLateRuleInput,
  ListFeeLateRulesInput,
  WaiveStudentFineInput,
} from "@/server/validators/fine.validator";

export async function createFeeLateRuleAction(input: CreateFeeLateRuleInput) {
  const rule = await createFeeLateRule(input);
  revalidatePath("/fees");
  revalidatePath("/settings");
  return { success: true, ruleId: rule.id };
}

export async function waiveStudentFineAction(input: WaiveStudentFineInput) {
  const fine = await waiveStudentFine(input);
  revalidatePath("/fees");
  revalidatePath(`/students/${fine.studentFeeId}`);
  return { success: true, fineId: fine.id, status: fine.status };
}

export async function listFeeLateRulesAction(input?: ListFeeLateRulesInput) {
  return listFeeLateRules(input);
}

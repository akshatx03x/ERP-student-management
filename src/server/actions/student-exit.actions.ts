"use server";

import { revalidatePath } from "next/cache";
import { cancelStudentExit, recordStudentExit } from "@/server/services/student-exit.service";
import type { CreateStudentExitInput } from "@/server/validators/student-exit.validator";

export async function recordStudentExitAction(input: CreateStudentExitInput) {
  try {
    const result = await recordStudentExit(input);
    revalidatePath("/students");
    revalidatePath("/students/former");
    revalidatePath("/students/alumni");
    revalidatePath("/promotion");
    revalidatePath(`/students/${input.studentId}`);
    return { success: true, data: JSON.parse(JSON.stringify(result)), error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Failed to record student exit",
    };
  }
}

export async function cancelStudentExitAction(studentId: string) {
  try {
    const result = await cancelStudentExit(studentId);
    revalidatePath("/students");
    revalidatePath("/students/former");
    revalidatePath("/students/alumni");
    revalidatePath("/promotion");
    revalidatePath(`/students/${studentId}`);
    return { success: true, data: JSON.parse(JSON.stringify(result)), error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Failed to cancel student exit",
    };
  }
}

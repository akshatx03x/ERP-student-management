"use server";

import { getStudentFinancialProfile } from "@/server/services/financial-profile.service";

export async function getStudentFinancialProfileAction(studentId: string, sessionId?: string) {
  return getStudentFinancialProfile(studentId, sessionId);
}

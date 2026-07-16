"use server";

import { revalidatePath } from "next/cache";
import {
  listSessions,
  createSession,
  setCurrentSession,
  closeSession,
  archiveSession,
  getCurrentSession,
  promoteStudents,
} from "@/server/services/session.service";
import type { CreateSessionInput, PromoteStudentsInput } from "@/server/validators/session.validator";

export async function listSessionsAction(input?: { page?: number; pageSize?: number; search?: string }) {
  return listSessions(input);
}

export async function getCurrentSessionAction() {
  return getCurrentSession();
}

export async function createSessionAction(input: CreateSessionInput) {
  const result = await createSession(input);
  revalidatePath("/academics");
  return result;
}

export async function setCurrentSessionAction(sessionId: string) {
  const result = await setCurrentSession(sessionId);
  revalidatePath("/academics");
  return result;
}

export async function closeSessionAction(sessionId: string) {
  const result = await closeSession(sessionId);
  revalidatePath("/academics");
  return result;
}

export async function archiveSessionAction(sessionId: string) {
  const result = await archiveSession(sessionId);
  revalidatePath("/academics");
  return result;
}

export async function promoteStudentsAction(input: PromoteStudentsInput) {
  const result = await promoteStudents(input);
  revalidatePath("/academics");
  revalidatePath("/students");
  return result;
}

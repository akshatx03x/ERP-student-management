"use server";

import { revalidatePath } from "next/cache";
import {
  listClasses,
  createClass,
  createSection,
  listSubjects,
  createSubject,
  assignClassTeacher,
  listClassTeachers,
  deleteClass,
  deleteSection,
  deleteSubject,
} from "@/server/services/class.service";
import { listStaff } from "@/server/services/staff.service";
import { getCurrentSession } from "@/server/services/session.service";
import type {
  AssignClassTeacherInput,
  CreateClassInput,
  CreateSectionInput,
  CreateSubjectInput,
} from "@/server/validators/class.validator";

export async function listClassesAction(input?: { page?: number; pageSize?: number; search?: string }) {
  return listClasses(input);
}

export async function createClassAction(input: CreateClassInput) {
  const result = await createClass(input);
  revalidatePath("/classes");
  return result;
}

export async function createSectionAction(input: CreateSectionInput) {
  const result = await createSection(input);
  revalidatePath("/classes");
  return result;
}

export async function listSubjectsAction(input?: { page?: number; pageSize?: number; search?: string }) {
  return listSubjects(input);
}

export async function createSubjectAction(input: CreateSubjectInput) {
  const result = await createSubject(input);
  revalidatePath("/classes");
  return result;
}

export async function deleteClassAction(id: string) {
  await deleteClass(id);
  revalidatePath("/classes");
}

export async function deleteSectionAction(id: string) {
  await deleteSection(id);
  revalidatePath("/classes");
}

export async function deleteSubjectAction(id: string) {
  await deleteSubject(id);
  revalidatePath("/classes");
}

export async function listClassTeachersAction(sessionId: string) {
  return listClassTeachers(sessionId);
}

export async function assignClassTeacherAction(input: AssignClassTeacherInput) {
  const result = await assignClassTeacher(input);
  revalidatePath("/classes");
  return result;
}

export async function listTeachersForAssignAction() {
  return listStaff({ role: "TEACHER", pageSize: 100 });
}

export async function getClassesPageDataAction() {
  const [classes, subjects, currentSession] = await Promise.all([
    listClasses({ pageSize: 100 }),
    listSubjects({ pageSize: 100 }),
    getCurrentSession(),
  ]);
  const teachers = currentSession
    ? await listClassTeachers(currentSession.id)
    : [];
  return { classes, subjects, currentSession, teachers };
}

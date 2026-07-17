"use server";

import { revalidatePath } from "next/cache";
import {
  listStudents,
  getStudent,
  createStudent,
  createStudentWithFamily,
  mergeSiblings,
  updateStudent,
  deleteStudent,
  createEnrollment,
  upsertMedical,
  createStudentLogin,
} from "@/server/services/student.service";
import { listClasses } from "@/server/services/class.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { exportStudents, importStudents } from "@/server/services/student-excel.service";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { requirePermission } from "@/server/permissions/guard";
import type {
  CreateEnrollmentInput,
  CreateStudentInput,
  CreateStudentWithFamilyInput,
  MergeSiblingsInput,
  UpdateStudentInput,
  UpsertMedicalInput,
} from "@/server/validators/student.validator";

export async function listStudentsAction(input?: Parameters<typeof listStudents>[0]) {
  return listStudents(input);
}

export async function getStudentAction(id: string) {
  return getStudent(id);
}

export async function createStudentAction(input: CreateStudentInput) {
  const result = await createStudent(input);
  revalidatePath("/students");
  revalidatePath("/families");
  return result;
}

export async function createStudentWithFamilyAction(input: CreateStudentWithFamilyInput) {
  const result = await createStudentWithFamily(input);
  revalidatePath("/students");
  revalidatePath("/families");
  return result;
}

export async function mergeSiblingsAction(input: MergeSiblingsInput) {
  const result = await mergeSiblings(input);
  revalidatePath("/students");
  revalidatePath("/families");
  revalidatePath(`/families/${result.familyId}`);
  return result;
}

export async function updateStudentAction(input: UpdateStudentInput) {
  const result = await updateStudent(input);
  revalidatePath("/students");
  revalidatePath(`/students/${input.id}`);
  return result;
}

export async function createEnrollmentAction(input: CreateEnrollmentInput) {
  const result = await createEnrollment(input);
  revalidatePath("/students");
  revalidatePath(`/students/${input.studentId}`);
  return result;
}

export async function upsertMedicalAction(input: UpsertMedicalInput) {
  const result = await upsertMedical(input);
  revalidatePath(`/students/${input.studentId}`);
  return result;
}

export async function createStudentLoginAction(studentId: string) {
  const result = await createStudentLogin(studentId);
  revalidatePath(`/students/${studentId}`);
  return result;
}

export async function getStudentFormOptionsAction() {
  const [classes, sessions, currentSession] = await Promise.all([
    listClasses({ pageSize: 100 }),
    listSessions({ pageSize: 50 }),
    getCurrentSession(),
  ]);
  return { classes, sessions, currentSession };
}

export async function deleteStudentAction(studentId: string) {
  const result = await deleteStudent(studentId);
  revalidatePath("/students");
  revalidatePath("/families");
  return result;
}

export async function exportStudentsAction(filters: {
  search?: string;
  classId?: string;
  sectionId?: string;
}) {
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);
  const buffer = await exportStudents(schoolId, filters);
  return buffer.toString("base64");
}

export async function importStudentsAction(base64: string) {
  const { user } = await requirePermission("student.create");
  const schoolId = schoolIdFromUser(user);
  const result = await importStudents(base64, schoolId, user.id);
  revalidatePath("/students");
  revalidatePath("/families");
  return result;
}

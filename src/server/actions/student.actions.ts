"use server";

import { revalidatePath } from "next/cache";
import {
  listStudents,
  listFormerStudents,
  listAlumniStudents,
  getStudent,
  createStudent,
  createStudentWithFamily,
  mergeSiblings,
  updateStudent,
  deleteStudent,
  createEnrollment,
  upsertMedical,
  createStudentLogin,
  unlinkStudentFamily,
} from "@/server/services/student.service";
import { listClasses } from "@/server/services/class.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { exportStudents, validateStudentsImport, executeStudentsImport, downloadImportSample } from "@/server/services/student-excel.service";
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

export async function listFormerStudentsAction(input?: Parameters<typeof listFormerStudents>[0]) {
  return listFormerStudents(input);
}

export async function listAlumniStudentsAction(input?: Parameters<typeof listAlumniStudents>[0]) {
  return listAlumniStudents(input);
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
  try {
    const result = await createStudentWithFamily(input);
    revalidatePath("/students");
    revalidatePath("/families");
    return { success: true, data: JSON.parse(JSON.stringify(result)), error: null };
  } catch (error) {
    return { success: false, data: null, error: error instanceof Error ? error.message : "Failed to create student" };
  }
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
  revalidatePath(`/students/${input.id}/details`);
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

export async function validateStudentsImportAction(base64: string, duplicateStrategy: "SKIP" | "FAIL") {
  const { user } = await requirePermission("student.create");
  const schoolId = schoolIdFromUser(user);
  return validateStudentsImport(base64, schoolId, duplicateStrategy);
}

export async function executeStudentsImportAction(validatedRows: any[], duplicateStrategy: "SKIP" | "FAIL") {
  const { user } = await requirePermission("student.create");
  const schoolId = schoolIdFromUser(user);
  const result = await executeStudentsImport(validatedRows, schoolId, user.id);
  revalidatePath("/students");
  revalidatePath("/families");
  return result;
}

export async function downloadImportSampleAction() {
  await requirePermission("student.create");
  const buffer = await downloadImportSample();
  return buffer.toString("base64");
}

export async function unlinkStudentFamilyAction(studentId: string) {
  const result = await unlinkStudentFamily(studentId);
  revalidatePath("/students");
  revalidatePath("/families");
  return result;
}

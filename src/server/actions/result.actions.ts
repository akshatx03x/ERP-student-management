"use server";

import {
  listGlobalSubjects,
  createGlobalSubject,
  updateGlobalSubject,
  deleteGlobalSubject,
  listClassSubjects,
  assignClassSubjects,
  listClassExams,
  createClassExam,
  updateClassExam,
  deleteClassExam,
  getClassResultsOverview,
  getStudentMarksData,
  saveStudentMarks,
  generateMarksTemplate,
  validateMarksImport,
  importClassMarks,
  bulkPublishClassResults,
  bulkUnpublishClassResults,
  publishStudentResult,
  unpublishStudentResult,
} from "@/server/services/result.service";
import { SubjectType, ExamPublishStatus, ResultOutcome, ResultStatus } from "@prisma/client";

// ── Subjects CRUD Actions ─────────────────────────────────────────────────────

export async function listGlobalSubjectsAction() {
  return listGlobalSubjects();
}

export async function createGlobalSubjectAction(input: {
  name: string;
  code: string;
  subjectType: SubjectType;
  displayOrder: number;
}) {
  return createGlobalSubject(input);
}

export async function updateGlobalSubjectAction(id: string, input: {
  name: string;
  code: string;
  subjectType: SubjectType;
  displayOrder: number;
}) {
  return updateGlobalSubject(id, input);
}

export async function deleteGlobalSubjectAction(id: string) {
  return deleteGlobalSubject(id);
}

// ── Class Subject Mapping Actions ─────────────────────────────────────────────

export async function listClassSubjectsAction(classId: string, sessionId: string) {
  return listClassSubjects(classId, sessionId);
}

export async function assignClassSubjectsAction(
  classId: string,
  sessionId: string,
  assignments: { subjectId: string; isOptional: boolean }[]
) {
  return assignClassSubjects(classId, sessionId, assignments);
}

// ── Exam Structure Actions ────────────────────────────────────────────────────

export async function listClassExamsAction(classId: string, sessionId: string) {
  return listClassExams(classId, sessionId);
}

export async function createClassExamAction(input: {
  classId: string;
  sessionId: string;
  examTypeId: string;
  name: string;
  term: number;
  displayOrder: number;
  maxMarks?: number | null;
  passMarks?: number | null;
  publishStatus: ExamPublishStatus;
  visibilityStatus: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
  subjects: { subjectId: string; maxMarks: number; passMarks: number }[];
}) {
  return createClassExam(input);
}

export async function updateClassExamAction(
  id: string,
  input: {
    name: string;
    term: number;
    displayOrder: number;
    maxMarks?: number | null;
    passMarks?: number | null;
    publishStatus: ExamPublishStatus;
    visibilityStatus: boolean;
    startDate?: Date | null;
    endDate?: Date | null;
    subjects: { subjectId: string; maxMarks: number; passMarks: number }[];
  }
) {
  return updateClassExam(id, input);
}

export async function deleteClassExamAction(id: string) {
  return deleteClassExam(id);
}

// ── Results Page Actions ──────────────────────────────────────────────────────

export async function getClassResultsOverviewAction(filters: {
  classId: string;
  sectionId?: string | null;
  sessionId: string;
  search?: string;
}) {
  return getClassResultsOverview(filters);
}

export async function getStudentMarksDataAction(studentId: string, sessionId: string) {
  return getStudentMarksData(studentId, sessionId);
}

export async function saveStudentMarksAction(input: {
  studentId: string;
  sessionId: string;
  marks: { examSubjectId: string; marksObtained: number }[];
  termDetail?: {
    workingDays?: number | null;
    presentDays?: number | null;
    remarksMid?: string | null;
    remarksFinal?: string | null;
    resultOutcome?: ResultOutcome | null;
    principalRemarks?: string | null;
    status?: ResultStatus;
    gkGrade?: string | null;
    artGrade?: string | null;
    rank?: number | null;
    resultDate?: Date | null;
  } | null;
  reason?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await saveStudentMarks(input);
    return { success: true, data: res };
  } catch (error: any) {
    console.error("[saveStudentMarksAction Error]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save student marks",
    };
  }
}

export async function generateMarksTemplateAction(input: {
  classId: string;
  sectionId?: string | null;
  subjectIds: string[];
  examIds: string[];
  sessionId: string;
}) {
  return generateMarksTemplate(input);
}

export async function validateMarksImportAction(input: {
  base64File: string;
  classId: string;
  sectionId?: string | null;
  subjectIds: string[];
  examIds: string[];
  sessionId: string;
}) {
  return validateMarksImport(input);
}

export async function importClassMarksAction(input: {
  sessionId: string;
  sheets: {
    sheetName: string;
    validRecords: {
      studentId: string;
      marks: { examSubjectId: string; marksObtained: number; isAbsent: boolean }[];
      isExisting: boolean;
    }[];
  }[];
  conflictResolution: "UPDATE" | "SKIP";
}) {
  return importClassMarks(input);
}

export async function bulkPublishClassResultsAction(input: {
  classId: string;
  sectionId?: string | null;
  sessionId: string;
}): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const res = await bulkPublishClassResults(input);
    return { success: true, count: res.count };
  } catch (error: any) {
    console.error("[bulkPublishClassResultsAction Error]", error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : "Failed to bulk publish results",
    };
  }
}

export async function bulkUnpublishClassResultsAction(input: {
  classId: string;
  sectionId?: string | null;
  sessionId: string;
}): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const res = await bulkUnpublishClassResults(input);
    return { success: true, count: res.count };
  } catch (error: any) {
    console.error("[bulkUnpublishClassResultsAction Error]", error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : "Failed to bulk unpublish results",
    };
  }
}

export async function publishStudentResultAction(
  studentId: string,
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await publishStudentResult(studentId, sessionId);
    return { success: true };
  } catch (error: any) {
    console.error("[publishStudentResultAction Error]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to publish result",
    };
  }
}

export async function unpublishStudentResultAction(
  studentId: string,
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await unpublishStudentResult(studentId, sessionId);
    return { success: true };
  } catch (error: any) {
    console.error("[unpublishStudentResultAction Error]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unpublish result",
    };
  }
}


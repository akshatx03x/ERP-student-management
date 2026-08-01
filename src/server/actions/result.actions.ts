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
  sectionId: string;
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
  } | null;
}) {
  return saveStudentMarks(input);
}

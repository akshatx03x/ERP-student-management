import { Prisma, ResultStatus, ResultOutcome, SubjectType, ExamPublishStatus } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { decimalToNumber, schoolIdFromUser, toDecimal } from "@/server/lib/helpers";
import { writeAuditLog } from "@/server/services/audit.service";
import ExcelJS from "exceljs";

// ── 1. SUBJECT MANAGEMENT ─────────────────────────────────────────────────────

export async function listGlobalSubjects() {
  const { user } = await requirePermission("subject.view");
  const schoolId = schoolIdFromUser(user);

  return prisma.subject.findMany({
    where: { schoolId },
    orderBy: { displayOrder: "asc" },
  });
}

export async function createGlobalSubject(input: {
  name: string;
  code: string;
  subjectType: SubjectType;
  displayOrder: number;
}) {
  const { user } = await requirePermission("subject.create");
  const schoolId = schoolIdFromUser(user);

  const dupName = await prisma.subject.findFirst({
    where: { schoolId, name: input.name.trim() },
  });
  if (dupName) throw new Error(`Subject with name "${input.name}" already exists.`);

  const dupCode = await prisma.subject.findFirst({
    where: { schoolId, code: input.code.trim().toUpperCase() },
  });
  if (dupCode) throw new Error(`Subject with code "${input.code}" already exists.`);

  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({
      data: {
        schoolId,
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        subjectType: input.subjectType,
        displayOrder: input.displayOrder,
      },
    });

    await writeAuditLog({
      schoolId,
      userId: user.id,
      action: "create",
      module: "subject",
      entityType: "Subject",
      entityId: subject.id,
      newValue: subject,
    }, tx);

    return subject;
  });
}

export async function updateGlobalSubject(id: string, input: {
  name: string;
  code: string;
  subjectType: SubjectType;
  displayOrder: number;
  isActive?: boolean;
}) {
  const { user } = await requirePermission("subject.update");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.subject.findFirst({
    where: { id, schoolId },
  });
  if (!existing) throw new Error("Subject not found");

  const dupName = await prisma.subject.findFirst({
    where: { schoolId, name: input.name.trim(), id: { not: id } },
  });
  if (dupName) throw new Error(`Subject with name "${input.name}" already exists.`);

  const dupCode = await prisma.subject.findFirst({
    where: { schoolId, code: input.code.trim().toUpperCase(), id: { not: id } },
  });
  if (dupCode) throw new Error(`Subject with code "${input.code}" already exists.`);

  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.update({
      where: { id },
      data: {
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        subjectType: input.subjectType,
        displayOrder: input.displayOrder,
        isActive: input.isActive !== undefined ? input.isActive : undefined,
      },
    });

    await writeAuditLog({
      schoolId,
      userId: user.id,
      action: "update",
      module: "subject",
      entityType: "Subject",
      entityId: subject.id,
      oldValue: existing,
      newValue: subject,
    }, tx);

    return subject;
  });
}

export async function deleteGlobalSubject(id: string) {
  const { user } = await requirePermission("subject.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.subject.findFirst({
    where: { id, schoolId },
  });
  if (!existing) throw new Error("Subject not found");

  // Check if any mark entries exist for this subject
  const hasMarks = await prisma.markEntry.findFirst({
    where: {
      examSubject: {
        subjectId: id,
      },
    },
  });

  return prisma.$transaction(async (tx) => {
    if (hasMarks) {
      const subject = await tx.subject.update({
        where: { id },
        data: { isActive: false },
      });
      await writeAuditLog({
        schoolId,
        userId: user.id,
        action: "update",
        module: "subject",
        entityType: "Subject",
        entityId: id,
        oldValue: existing,
        newValue: subject,
      }, tx);
      return { success: true, archived: true };
    } else {
      await tx.subject.delete({ where: { id } });
      await writeAuditLog({
        schoolId,
        userId: user.id,
        action: "delete",
        module: "subject",
        entityType: "Subject",
        entityId: id,
        oldValue: existing,
      }, tx);
      return { success: true, archived: false };
    }
  });
}

// Class-subject mappings
export async function listClassSubjects(classId: string, sessionId: string) {
  const { user } = await requirePermission("subject.view");
  const schoolId = schoolIdFromUser(user);

  return prisma.classSubject.findMany({
    where: {
      classId,
      sessionId,
      class: { schoolId },
    },
    include: {
      subject: true,
    },
    orderBy: {
      subject: { displayOrder: "asc" },
    },
  });
}

export async function assignClassSubjects(classId: string, sessionId: string, assignments: { subjectId: string; isOptional: boolean }[]) {
  const { user } = await requirePermission("subject.update");
  const schoolId = schoolIdFromUser(user);

  // Validate class and session
  const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
  if (!cls) throw new Error("Class not found");

  const session = await prisma.academicSession.findFirst({ where: { id: sessionId, schoolId } });
  if (!session) throw new Error("Academic session not found");

  return prisma.$transaction(async (tx) => {
    // Drop existing mappings
    await tx.classSubject.deleteMany({
      where: { classId, sessionId },
    });

    // Create new ones
    const created = [];
    for (const ass of assignments) {
      const mapping = await tx.classSubject.create({
        data: {
          classId,
          sessionId,
          subjectId: ass.subjectId,
          isOptional: ass.isOptional,
        },
        include: { subject: true },
      });
      created.push(mapping);
    }

    await writeAuditLog({
      schoolId,
      userId: user.id,
      action: "update",
      module: "subject",
      entityType: "ClassSubjectAssignment",
      entityId: classId,
      newValue: { count: created.length, subjectIds: assignments.map(a => a.subjectId) },
    }, tx);

    return created;
  });
}

// ── 2. EXAM STRUCTURE ─────────────────────────────────────────────────────────

import { EXAM_CONFIGS } from "@/config/exams.config";

export async function ensureClassExams(classId: string, sessionId: string, txClient?: Prisma.TransactionClient) {
  const db = txClient ?? prisma;

  // 1. Get or create the scholastic exam type
  let examType = await db.examType.findFirst({
    where: { sessionId, name: "Scholastic Assessment" },
  });
  if (!examType) {
    examType = await db.examType.create({
      data: { sessionId, name: "Scholastic Assessment" },
    });
  }

  // 2. Load subjects mapped to this class
  const classSubjects = await db.classSubject.findMany({
    where: { classId, sessionId },
  });

  // 3. Ensure the 6 exams exist
  for (const cfg of EXAM_CONFIGS) {
    let exam = await db.exam.findFirst({
      where: { classId, sessionId, name: cfg.name },
    });

    if (!exam) {
      exam = await db.exam.create({
        data: {
          classId,
          sessionId,
          examTypeId: examType.id,
          name: cfg.name,
          term: cfg.term,
          displayOrder: cfg.displayOrder,
          maxMarks: toDecimal(cfg.maxMarks),
          passMarks: toDecimal(cfg.passMarks),
          publishStatus: "DRAFT",
          visibilityStatus: true,
        },
      });
    }

    // 4. Ensure ExamSubject mappings exist for each class subject
    for (const cs of classSubjects) {
      const exists = await db.examSubject.findUnique({
        where: {
          examId_subjectId: {
            examId: exam.id,
            subjectId: cs.subjectId,
          },
        },
      });

      if (!exists) {
        await db.examSubject.create({
          data: {
            examId: exam.id,
            subjectId: cs.subjectId,
            maxMarks: toDecimal(cfg.maxMarks),
            passMarks: toDecimal(cfg.passMarks),
          },
        });
      }
    }
  }
}

export async function listClassExams(classId: string, sessionId: string) {
  const { user } = await requirePermission("exam.view");
  const schoolId = schoolIdFromUser(user);

  await ensureClassExams(classId, sessionId);

  const exams = await prisma.exam.findMany({
    where: {
      classId,
      sessionId,
      class: { schoolId },
    },
    orderBy: { displayOrder: "asc" },
    include: {
      examType: true,
      subjects: {
        include: { subject: true },
      },
    },
  });

  return exams.map(serializeExam);
}

function serializeExam(ex: any) {
  if (!ex) return null;
  return {
    ...ex,
    maxMarks: ex.maxMarks ? decimalToNumber(ex.maxMarks) : null,
    passMarks: ex.passMarks ? decimalToNumber(ex.passMarks) : null,
    subjects: ex.subjects ? ex.subjects.map((es: any) => ({
      ...es,
      maxMarks: decimalToNumber(es.maxMarks),
      passMarks: decimalToNumber(es.passMarks),
    })) : [],
  };
}

export async function createClassExam(input: {
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
  const { user } = await requirePermission("exam.create");
  const schoolId = schoolIdFromUser(user);

  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        classId: input.classId,
        sessionId: input.sessionId,
        examTypeId: input.examTypeId,
        name: input.name.trim(),
        term: input.term,
        displayOrder: input.displayOrder,
        maxMarks: input.maxMarks ? toDecimal(input.maxMarks) : null,
        passMarks: input.passMarks ? toDecimal(input.passMarks) : null,
        publishStatus: input.publishStatus,
        visibilityStatus: input.visibilityStatus,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
      },
    });

    // Create exam subjects
    for (const sub of input.subjects) {
      await tx.examSubject.create({
        data: {
          examId: exam.id,
          subjectId: sub.subjectId,
          maxMarks: toDecimal(sub.maxMarks),
          passMarks: toDecimal(sub.passMarks),
        },
      });
    }

    const fullExam = await tx.exam.findUnique({
      where: { id: exam.id },
      include: { subjects: { include: { subject: true } } },
    });

    await writeAuditLog({
      schoolId,
      userId: user.id,
      action: "create",
      module: "exam",
      entityType: "Exam",
      entityId: exam.id,
      newValue: fullExam,
    }, tx);

    return serializeExam(fullExam);
  });
}

export async function updateClassExam(id: string, input: {
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
  const { user } = await requirePermission("exam.update");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.exam.findFirst({
    where: { id, class: { schoolId } },
    include: { subjects: true },
  });
  if (!existing) throw new Error("Exam not found");

  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.update({
      where: { id },
      data: {
        name: input.name.trim(),
        term: input.term,
        displayOrder: input.displayOrder,
        maxMarks: input.maxMarks ? toDecimal(input.maxMarks) : null,
        passMarks: input.passMarks ? toDecimal(input.passMarks) : null,
        publishStatus: input.publishStatus,
        visibilityStatus: input.visibilityStatus,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
      },
    });

    // Sync exam subjects (delete old, insert new)
    await tx.examSubject.deleteMany({
      where: { examId: id },
    });

    for (const sub of input.subjects) {
      await tx.examSubject.create({
        data: {
          examId: id,
          subjectId: sub.subjectId,
          maxMarks: toDecimal(sub.maxMarks),
          passMarks: toDecimal(sub.passMarks),
        },
      });
    }

    const fullExam = await tx.exam.findUnique({
      where: { id },
      include: { subjects: { include: { subject: true } } },
    });

    await writeAuditLog({
      schoolId,
      userId: user.id,
      action: "update",
      module: "exam",
      entityType: "Exam",
      entityId: id,
      oldValue: existing,
      newValue: fullExam,
    }, tx);

    return serializeExam(fullExam);
  });
}

export async function deleteClassExam(id: string) {
  const { user } = await requirePermission("exam.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.exam.findFirst({
    where: { id, class: { schoolId } },
  });
  if (!existing) throw new Error("Exam not found");

  return prisma.$transaction(async (tx) => {
    await tx.exam.delete({ where: { id } });

    await writeAuditLog({
      schoolId,
      userId: user.id,
      action: "delete",
      module: "exam",
      entityType: "Exam",
      entityId: id,
      oldValue: existing,
    }, tx);

    return { success: true };
  });
}

// ── 3. RESULTS OVERVIEW & MARKS ENTRY ─────────────────────────────────────────

export async function getClassResultsOverview(filters: {
  classId: string;
  sectionId?: string | null;
  sessionId: string;
  search?: string;
}) {
  const { user } = await requirePermission("result.view");
  const schoolId = schoolIdFromUser(user);

  await ensureClassExams(filters.classId, filters.sessionId);

  const searchClause = filters.search?.trim()
    ? {
        OR: [
          { fullName: { contains: filters.search } },
          { admissionNo: { contains: filters.search } },
          { family: { fatherName: { contains: filters.search } } },
          { family: { motherName: { contains: filters.search } } },
          { family: { primaryPhone: { contains: filters.search } } },
          { family: { secondaryPhone: { contains: filters.search } } },
        ],
      }
    : {};

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classId: filters.classId,
      ...(filters.sectionId && filters.sectionId !== "ALL" ? { sectionId: filters.sectionId } : {}),
      sessionId: filters.sessionId,
      student: {
        schoolId,
        status: "ACTIVE",
        ...searchClause,
      },
    },
    include: {
      section: { select: { name: true } },
      student: {
        include: {
          family: { select: { fatherName: true } },
          termResults: {
            where: { sessionId: filters.sessionId },
          },
        },
      },
    },
    orderBy: {
      student: { fullName: "asc" },
    },
  });

  return enrollments.map((en) => {
    const termRes = en.student.termResults[0] ?? null;
    return {
      studentId: en.student.id,
      admissionNo: en.student.admissionNo,
      rollNo: en.rollNo ?? "—",
      fullName: en.student.fullName,
      fatherName: en.student.family?.fatherName ?? "—",
      status: termRes ? (termRes.status as string) : "DRAFT",
      outcome: termRes ? (termRes.resultOutcome as string) : null,
      presentDays: termRes ? termRes.presentDays : null,
      workingDays: termRes ? termRes.workingDays : null,
      hasSavedMarks: termRes !== null,
      photoUrl: en.student.photoUrl ?? null,
      sectionName: en.section.name,
    };
  });
}

export async function getStudentMarksData(studentId: string, sessionId: string) {
  const { user } = await requirePermission("marks.view");
  const schoolId = schoolIdFromUser(user);

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      enrollments: {
        where: { sessionId },
        include: { class: true, section: true },
      },
      termResults: {
        where: { sessionId },
      },
    },
  });
  if (!student) throw new Error("Student not found");

  const classId = student.enrollments[0]?.classId;
  if (!classId) throw new Error("Student enrollment not found for this session");

  await ensureClassExams(classId, sessionId);

  // Load all subjects assigned to this class
  const classSubjects = await prisma.classSubject.findMany({
    where: { classId, sessionId },
    include: { subject: true },
    orderBy: { subject: { displayOrder: "asc" } },
  });

  // Load all exams assigned to this class
  const exams = await prisma.exam.findMany({
    where: { classId, sessionId },
    orderBy: { displayOrder: "asc" },
    include: {
      subjects: true,
    },
  });

  // Load existing mark entries for the student
  const marks = await prisma.markEntry.findMany({
    where: {
      studentId,
      examSubject: {
        exam: { sessionId },
      },
    },
    include: {
      examSubject: true,
    },
  });

  const branding = await prisma.schoolBranding.findFirst({
    where: { schoolId },
  });

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      admissionNo: student.admissionNo,
      rollNo: student.enrollments[0]?.rollNo ?? "—",
      classSection: `${student.enrollments[0]?.class.name}-${student.enrollments[0]?.section.name}`,
      photoUrl: student.photoUrl ?? null,
    },
    schoolBranding: branding ? {
      schoolName: branding.schoolName,
      address: branding.address,
      phone: branding.phone,
      logoDocumentId: branding.logoDocumentId,
    } : null,
    subjects: classSubjects.map((cs) => ({
      id: cs.subject.id,
      name: cs.subject.name,
      code: cs.subject.code,
      type: cs.subject.subjectType,
      isOptional: cs.isOptional,
    })),
    exams: exams.map((ex) => ({
      id: ex.id,
      name: ex.name,
      term: ex.term,
      maxMarks: ex.maxMarks ? decimalToNumber(ex.maxMarks) : null,
      passMarks: ex.passMarks ? decimalToNumber(ex.passMarks) : null,
      subjects: ex.subjects.map((es) => ({
        subjectId: es.subjectId,
        examSubjectId: es.id,
        maxMarks: decimalToNumber(es.maxMarks),
        passMarks: decimalToNumber(es.passMarks),
      })),
    })),
    markEntries: marks.map((m) => ({
      examSubjectId: m.examSubjectId,
      marksObtained: decimalToNumber(m.marksObtained),
      grade: m.grade,
      remarks: m.remarks,
    })),
    termResult: student.termResults[0] ?? null,
  };
}

export async function saveStudentMarks(input: {
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
}) {
  const { user } = await requirePermission("marks.create");
  const schoolId = schoolIdFromUser(user);

  const student = await prisma.student.findFirst({
    where: { id: input.studentId, schoolId },
  });
  if (!student) throw new Error("Student not found");

  const existingTerm = await prisma.studentTermResult.findUnique({
    where: {
      studentId_sessionId: {
        studentId: input.studentId,
        sessionId: input.sessionId,
      },
    },
  });

  const isAuditRequired = existingTerm && (existingTerm.status === "PUBLISHED" || existingTerm.status === "LOCKED");
  if (isAuditRequired && !input.reason?.trim()) {
    throw new Error("Reason for modification is required for published or locked results.");
  }

  return prisma.$transaction(async (tx) => {
    // Collect previous values for audit log
    let prevMarks: any[] = [];
    if (isAuditRequired) {
      prevMarks = await tx.markEntry.findMany({
        where: {
          studentId: input.studentId,
          examSubject: { exam: { sessionId: input.sessionId } },
        },
      });
    }

    // 1. Save/Update Marks
    for (const m of input.marks) {
      const examSubject = await tx.examSubject.findUnique({
        where: { id: m.examSubjectId },
        include: { exam: true },
      });
      if (!examSubject) throw new Error(`Exam subject ${m.examSubjectId} not found`);

      const maxMarks = decimalToNumber(examSubject.maxMarks);
      if (m.marksObtained > maxMarks) {
        throw new Error(`Marks cannot exceed ${maxMarks} for subject`);
      }

      // Check if entry already exists
      const existing = await tx.markEntry.findUnique({
        where: {
          examSubjectId_studentId: {
            examSubjectId: m.examSubjectId,
            studentId: input.studentId,
          },
        },
      });

      // Simple grading: Resolve grade based on percentage using gradeScale if present
      const percent = maxMarks > 0 ? (m.marksObtained / maxMarks) * 105 : 0; // standard percent
      const scales = await tx.gradeScale.findMany({
        where: { schoolId },
        orderBy: { minPercent: "desc" },
      });
      let grade = "E";
      for (const scale of scales) {
        const min = decimalToNumber(scale.minPercent);
        const max = decimalToNumber(scale.maxPercent);
        const normalizedPercent = maxMarks > 0 ? (m.marksObtained / maxMarks) * 100 : 0;
        if (normalizedPercent >= min && normalizedPercent <= max) {
          grade = scale.grade;
          break;
        }
      }

      if (existing) {
        await tx.markEntry.update({
          where: { id: existing.id },
          data: {
            marksObtained: toDecimal(m.marksObtained),
            grade,
            enteredById: user.id,
          },
        });
      } else {
        await tx.markEntry.create({
          data: {
            examSubjectId: m.examSubjectId,
            studentId: input.studentId,
            marksObtained: toDecimal(m.marksObtained),
            grade,
            enteredById: user.id,
          },
        });
      }
    }

    // 2. Save Term details
    let termResultId = existingTerm?.id;
    if (input.termDetail) {
      const termRes = await tx.studentTermResult.upsert({
        where: {
          studentId_sessionId: {
            studentId: input.studentId,
            sessionId: input.sessionId,
          },
        },
        create: {
          studentId: input.studentId,
          sessionId: input.sessionId,
          workingDays: input.termDetail.workingDays ?? null,
          presentDays: input.termDetail.presentDays ?? null,
          remarksMid: input.termDetail.remarksMid ?? null,
          remarksFinal: input.termDetail.remarksFinal ?? null,
          resultOutcome: input.termDetail.resultOutcome ?? null,
          principalRemarks: input.termDetail.principalRemarks ?? null,
          gkGrade: input.termDetail.gkGrade ?? null,
          artGrade: input.termDetail.artGrade ?? null,
          rank: input.termDetail.rank ?? null,
          resultDate: input.termDetail.resultDate ?? null,
          status: input.termDetail.status ?? ResultStatus.DRAFT,
        },
        update: {
          workingDays: input.termDetail.workingDays ?? null,
          presentDays: input.termDetail.presentDays ?? null,
          remarksMid: input.termDetail.remarksMid ?? null,
          remarksFinal: input.termDetail.remarksFinal ?? null,
          resultOutcome: input.termDetail.resultOutcome ?? null,
          principalRemarks: input.termDetail.principalRemarks ?? null,
          gkGrade: input.termDetail.gkGrade ?? null,
          artGrade: input.termDetail.artGrade ?? null,
          rank: input.termDetail.rank ?? null,
          resultDate: input.termDetail.resultDate ?? null,
          status: input.termDetail.status ?? undefined,
        },
      });
      termResultId = termRes.id;
    }

    // 3. Write Audit Logs for modifications
    if (isAuditRequired && termResultId) {
      const updatedMarks = await tx.markEntry.findMany({
        where: {
          studentId: input.studentId,
          examSubject: { exam: { sessionId: input.sessionId } },
        },
      });

      await tx.resultChangeLog.create({
        data: {
          resultId: termResultId,
          editedById: user.id,
          reason: input.reason || "Modified",
          changes: {
            prevMarks: prevMarks.map((pm) => ({ esId: pm.examSubjectId, val: decimalToNumber(pm.marksObtained) })),
            newMarks: updatedMarks.map((um) => ({ esId: um.examSubjectId, val: decimalToNumber(um.marksObtained) })),
            prevTerm: existingTerm,
          },
        },
      });
    }

    await writeAuditLog({
      schoolId,
      userId: user.id,
      action: "update",
      module: "marks",
      entityType: "StudentMarks",
      entityId: input.studentId,
      newValue: { count: input.marks.length },
    }, tx);

    return { success: true };
  });
}

// ── 4. EXCEL MARKS IMPORT & EXPORT ───────────────────────────────────────────

export async function generateMarksTemplate(input: {
  classId: string;
  sectionId?: string | null;
  subjectIds: string[];
  examIds: string[];
  sessionId: string;
}) {
  const { user } = await requirePermission("marks.create");
  const schoolId = schoolIdFromUser(user);

  // 1. Fetch class details, selected exams, and selected subjects
  const classItem = await prisma.class.findFirst({
    where: { id: input.classId, schoolId },
    include: { sections: true },
  });
  if (!classItem) throw new Error("Class not found");

  const exams = await prisma.exam.findMany({
    where: { id: { in: input.examIds }, classId: input.classId, sessionId: input.sessionId },
  });
  if (exams.length === 0) throw new Error("No valid exams found");

  const classSubjects = await prisma.classSubject.findMany({
    where: {
      classId: input.classId,
      sessionId: input.sessionId,
      subjectId: { in: input.subjectIds },
    },
    include: { subject: true },
  });
  if (classSubjects.length === 0) throw new Error("No valid subjects found for this class");

  // Fetch enrolled students
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classId: input.classId,
      ...(input.sectionId && input.sectionId !== "ALL" ? { sectionId: input.sectionId } : {}),
      sessionId: input.sessionId,
      student: { schoolId, status: "ACTIVE" },
    },
    include: { student: true },
    orderBy: [
      { rollNo: "asc" },
      { student: { fullName: "asc" } }
    ],
  });

  const workbook = new ExcelJS.Workbook();
  const metadataRows: any[] = [];

  // 2. Generate a worksheet for each Exam
  for (const exam of exams) {
    // Worksheet name limit is 31 characters
    const sheetName = exam.name.substring(0, 31);
    const sheet = workbook.addWorksheet(sheetName);
    sheet.views = [{ showGridLines: true }];

    // Columns structure
    const columns = [
      { header: "Roll No", key: "rollNo", width: 12 },
      { header: "Admission No", key: "admissionNo", width: 18 },
      { header: "Student Name", key: "studentName", width: 30 },
    ];

    // Add selected subjects as columns
    const activeExamSubjects: any[] = [];
    for (const cs of classSubjects) {
      const examSub = await prisma.examSubject.findFirst({
        where: { examId: exam.id, subjectId: cs.subjectId },
      });
      if (examSub) {
        activeExamSubjects.push({
          subject: cs.subject,
          examSubject: examSub,
          maxMarks: decimalToNumber(examSub.maxMarks),
        });
      }
    }

    // Sort by display order
    activeExamSubjects.sort((a, b) => a.subject.displayOrder - b.subject.displayOrder);

    activeExamSubjects.forEach((es, idx) => {
      // Header: Subject Name, Key: subjectId, Width: 18
      columns.push({
        header: es.subject.name,
        key: `subject_${es.subject.id}`,
        width: 18,
      });

      // Track metadata: Sheet Name, Session ID, Exam ID, Class ID, Section ID, Subject ID, ExamSubject ID, Column Number (1-indexed)
      metadataRows.push([
        sheetName,
        input.sessionId,
        exam.id,
        input.classId,
        input.sectionId ?? "ALL",
        es.subject.id,
        es.examSubject.id,
        4 + idx, // column index (Roll No: 1, Admission No: 2, Student Name: 3, Subject 1: 4, Subject 2: 5...)
      ]);
    });

    // Hidden student ID column
    columns.push({
      header: "Student ID (Do Not Modify)",
      key: "studentId",
      width: 35,
    });

    sheet.columns = columns;

    // Apply header style (Row 1)
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Insert Max Marks Row (Row 2)
    const maxMarksRowValues: any[] = ["Max Marks", "", ""];
    activeExamSubjects.forEach((es) => {
      maxMarksRowValues.push(`Max:${es.maxMarks}`);
    });
    maxMarksRowValues.push(""); // for studentId column

    sheet.addRow(maxMarksRowValues);
    const row2 = sheet.getRow(2);
    row2.font = { italic: true, bold: true, color: { argb: "FF666666" } };
    row2.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF5F5F5" },
    };

    // Populate data rows (starting from Row 3)
    enrollments.forEach((e) => {
      const rowData: any = {
        rollNo: e.rollNo ?? "—",
        admissionNo: e.student.admissionNo,
        studentName: e.student.fullName,
        studentId: e.studentId,
      };
      // Marks columns default to empty
      activeExamSubjects.forEach((es) => {
        rowData[`subject_${es.subject.id}`] = "";
      });
      sheet.addRow(rowData);
    });

    // Hide Student ID column (Column index = 4 + activeExamSubjects.length)
    const idColIdx = 4 + activeExamSubjects.length;
    sheet.getColumn(idColIdx).hidden = true;

    // Apply cell locks (Row 1 headers, Row 2 max marks, Col 1-3 info, and hidden Col ID are locked. Marks columns are unlocked).
    sheet.eachRow((row, rowNumber) => {
      row.getCell(1).protection = { locked: true };
      row.getCell(2).protection = { locked: true };
      row.getCell(3).protection = { locked: true };

      if (rowNumber === 1 || rowNumber === 2) {
        // lock headers and max marks row completely
        for (let c = 1; c <= idColIdx; c++) {
          row.getCell(c).protection = { locked: true };
        }
      } else {
        // student row: unlock marks columns, lock studentId
        for (let c = 4; c < idColIdx; c++) {
          row.getCell(c).protection = { locked: false };
        }
        row.getCell(idColIdx).protection = { locked: true };
      }
    });

    // Protect sheet
    await sheet.protect("vps-marks-protect", {
      selectLockedCells: true,
      selectUnlockedCells: true,
    });
  }

  // 3. Write metadata sheet
  const metaSheet = workbook.addWorksheet("_metadata");
  metaSheet.views = [{ showGridLines: false }];
  metadataRows.forEach((row) => {
    metaSheet.addRow(row);
  });
  metaSheet.state = "hidden"; // Hide metadata sheet

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as any).toString("base64");
}

export async function validateMarksImport(input: {
  base64File: string;
  classId: string;
  sectionId?: string | null;
  subjectIds: string[];
  examIds: string[];
  sessionId: string;
}) {
  const { user } = await requirePermission("marks.create");
  const schoolId = schoolIdFromUser(user);

  const buffer = Buffer.from(input.base64File, "base64");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  // 1. Read metadata sheet and validate integrity
  const metaSheet = workbook.getWorksheet("_metadata");
  if (!metaSheet) {
    throw new Error("Invalid template: Hidden metadata sheet is missing. Please use a template generated by the system.");
  }

  // Map metadata rows: key is SheetName, value is array of column descriptors
  const metadataMap = new Map<string, any[]>();
  metaSheet.eachRow((row) => {
    const sheetName = row.getCell(1).value?.toString();
    const sessId = row.getCell(2).value?.toString();
    const exId = row.getCell(3).value?.toString();
    const clId = row.getCell(4).value?.toString();
    const secId = row.getCell(5).value?.toString();
    const subId = row.getCell(6).value?.toString();
    const exSubId = row.getCell(7).value?.toString();
    const colIdx = Number(row.getCell(8).value);

    if (sheetName && sessId && exId && clId && secId && subId && exSubId && colIdx) {
      if (!metadataMap.has(sheetName)) {
        metadataMap.set(sheetName, []);
      }
      metadataMap.get(sheetName)!.push({
        sessionId: sessId,
        examId: exId,
        classId: clId,
        sectionId: secId,
        subjectId: subId,
        examSubjectId: exSubId,
        columnNumber: colIdx,
      });
    }
  });

  // Verify that the metadata matches the currently selected filters
  for (const [sheetName, cols] of metadataMap.entries()) {
    for (const col of cols) {
      if (
        col.sessionId !== input.sessionId ||
        col.classId !== input.classId ||
        col.sectionId !== (input.sectionId ?? "ALL") ||
        !input.subjectIds.includes(col.subjectId) ||
        !input.examIds.includes(col.examId)
      ) {
        throw new Error(
          `Template mismatch: The uploaded template does not match the currently selected academic session, class, section, subjects, or exams.`
        );
      }
    }
  }

  // Get active system enrollments for comparison
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classId: input.classId,
      ...(input.sectionId && input.sectionId !== "ALL" ? { sectionId: input.sectionId } : {}),
      sessionId: input.sessionId,
      student: { schoolId, status: "ACTIVE" },
    },
    include: { student: true },
  });
  const enrollmentsMap = new Map(enrollments.map((e) => [e.studentId, e]));

  const sheetsResult: any[] = [];
  let totalValid = 0;
  let totalInvalid = 0;
  let totalExisting = 0;

  // 2. Validate sheet by sheet
  for (const [sheetName, cols] of metadataMap.entries()) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      throw new Error(`Invalid template: Sheet named '${sheetName}' was not found in the workbook.`);
    }

    const errors: { row: number; studentName: string; subjectName: string; error: string }[] = [];
    const duplicateCheck = new Set<string>();

    let totalRecords = 0;
    let validRecordsCount = 0;
    let invalidRecordsCount = 0;
    let existingRecordsCount = 0;
    let duplicateRecordsCount = 0;

    const validRecords: any[] = [];

    // Columns mapping: key is column index, value is subject metadata
    const colMapping = new Map<number, any>();
    cols.forEach((col) => {
      colMapping.set(col.columnNumber, col);
    });

    // Read subject names and max marks from sheet to show in errors
    const maxCols = 3 + cols.length;
    const subjectsMeta: Record<number, { name: string; maxMarks: number; examSubjectId: string }> = {};

    for (let c = 4; c <= maxCols; c++) {
      const subjectName = sheet.getRow(1).getCell(c).value?.toString() || `Subject Col ${c}`;
      const maxMarksVal = sheet.getRow(2).getCell(c).value?.toString()?.replace("Max:", "") || "100";
      const maxMarks = Number(maxMarksVal) || 100;
      const metaCol = colMapping.get(c);

      if (metaCol) {
        subjectsMeta[c] = {
          name: subjectName,
          maxMarks,
          examSubjectId: metaCol.examSubjectId,
        };
      }
    }

    // Check existing marks in db for this exam
    const examSubjectIds = cols.map(c => c.examSubjectId);
    const existingMarks = await prisma.markEntry.findMany({
      where: {
        examSubjectId: { in: examSubjectIds },
        studentId: { in: enrollments.map((e) => e.studentId) },
      },
    });
    const existingMarksMap = new Set(existingMarks.map((m) => m.studentId));

    // hidden Student ID col idx
    const idColIdx = 4 + cols.length;

    sheet.eachRow((row, rowIdx) => {
      if (rowIdx === 1 || rowIdx === 2) return; // skip header and max marks rows

      const rollNo = row.getCell(1).value?.toString()?.trim() || "—";
      const admissionNo = row.getCell(2).value?.toString()?.trim() || "";
      const studentName = row.getCell(3).value?.toString()?.trim() || "";
      const studentId = row.getCell(idColIdx).value?.toString()?.trim();

      if (!studentId && !admissionNo && !studentName) return; // skip empty rows

      totalRecords++;
      let rowHasError = false;
      const rowErrors: { subjectName: string; error: string }[] = [];

      // Student validation
      if (!studentId) {
        rowHasError = true;
        rowErrors.push({ subjectName: "System", error: "Student ID column (hidden column H) is missing or has been cleared." });
      } else {
        const enrollment = enrollmentsMap.get(studentId);
        if (!enrollment) {
          rowHasError = true;
          rowErrors.push({ subjectName: "System", error: "Student not found or is not active in this class/section." });
        } else {
          // Cross-validate Admission No and Roll No
          if (enrollment.student.admissionNo !== admissionNo) {
            rowHasError = true;
            rowErrors.push({ subjectName: "System", error: `Admission number mismatch (Excel: ${admissionNo}, ERP: ${enrollment.student.admissionNo}).` });
          }
          const erpRoll = enrollment.rollNo ?? "—";
          if (erpRoll !== "—" && rollNo !== "—" && erpRoll !== rollNo) {
            rowHasError = true;
            rowErrors.push({ subjectName: "System", error: `Roll number mismatch (Excel: ${rollNo}, ERP: ${erpRoll}).` });
          }
        }

        // Duplicate checks
        if (duplicateCheck.has(studentId)) {
          rowHasError = true;
          rowErrors.push({ subjectName: "System", error: "Duplicate row in Excel sheet for same student." });
          duplicateRecordsCount++;
        } else {
          duplicateCheck.add(studentId);
        }
      }

      // Validate marks columns
      const marksList: { examSubjectId: string; marksObtained: number; isAbsent: boolean }[] = [];

      for (let c = 4; c <= maxCols; c++) {
        const cellValue = row.getCell(c).value;
        const subMeta = subjectsMeta[c];
        if (!subMeta) continue;

        if (cellValue === undefined || cellValue === null || cellValue === "") {
          rowHasError = true;
          rowErrors.push({ subjectName: subMeta.name, error: "Marks obtained is required (or enter 'AB' if absent)." });
        } else {
          const rawStr = cellValue.toString().trim().toUpperCase();
          if (rawStr === "AB") {
            marksList.push({
              examSubjectId: subMeta.examSubjectId,
              marksObtained: 0,
              isAbsent: true,
            });
          } else {
            const num = Number(cellValue);
            if (isNaN(num)) {
              rowHasError = true;
              rowErrors.push({ subjectName: subMeta.name, error: `Marks obtained must be numeric or 'AB'.` });
            } else if (num < 0) {
              rowHasError = true;
              rowErrors.push({ subjectName: subMeta.name, error: `Marks obtained cannot be negative.` });
            } else if (num > subMeta.maxMarks) {
              rowHasError = true;
              rowErrors.push({ subjectName: subMeta.name, error: `Marks obtained (${num}) exceeds maximum marks (${subMeta.maxMarks}).` });
            } else {
              marksList.push({
                examSubjectId: subMeta.examSubjectId,
                marksObtained: num,
                isAbsent: false,
              });
            }
          }
        }
      }

      if (rowHasError) {
        invalidRecordsCount++;
        rowErrors.forEach((err) => {
          errors.push({
            row: rowIdx,
            studentName: studentName || "Unknown Student",
            subjectName: err.subjectName,
            error: err.error,
          });
        });
      } else {
        validRecordsCount++;
        const isExisting = existingMarksMap.has(studentId!);
        if (isExisting) {
          existingRecordsCount++;
        }

        validRecords.push({
          studentId: studentId!,
          admissionNo: admissionNo!,
          studentName: studentName!,
          rollNo: rollNo ?? "—",
          marks: marksList,
          isExisting,
        });
      }
    });

    totalValid += validRecordsCount;
    totalInvalid += invalidRecordsCount;
    totalExisting += existingRecordsCount;

    sheetsResult.push({
      sheetName,
      totalRecords,
      validRecordsCount,
      invalidRecordsCount,
      existingRecordsCount,
      duplicateRecordsCount,
      errors,
      validRecords,
    });
  }

  return {
    sheets: sheetsResult,
    totalValid,
    totalInvalid,
    totalExisting,
  };
}

export async function importClassMarks(input: {
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
  const { user } = await requirePermission("marks.create");
  const schoolId = schoolIdFromUser(user);

  const scales = await prisma.gradeScale.findMany({
    where: { schoolId },
    orderBy: { minPercent: "desc" },
  });

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const sheet of input.sheets) {
      for (const rec of sheet.validRecords) {
        for (const m of rec.marks) {
          const examSubject = await tx.examSubject.findUnique({
            where: { id: m.examSubjectId },
          });
          if (!examSubject) continue;

          // Find existing
          const existing = await tx.markEntry.findUnique({
            where: {
              examSubjectId_studentId: {
                examSubjectId: m.examSubjectId,
                studentId: rec.studentId,
              },
            },
          });

          // Resolve grade based on percentage using gradeScale
          const maxMarks = decimalToNumber(examSubject.maxMarks);
          const percent = maxMarks > 0 ? (m.marksObtained / maxMarks) * 100 : 0;
          let grade = "E";
          for (const scale of scales) {
            const min = decimalToNumber(scale.minPercent);
            const max = decimalToNumber(scale.maxPercent);
            if (percent >= min && percent <= max) {
              grade = scale.grade;
              break;
            }
          }

          let remarksStr = m.isAbsent ? "ABSENT" : null;

          if (existing) {
            if (input.conflictResolution === "SKIP") {
              skippedCount++;
              continue;
            }

            await tx.markEntry.update({
              where: { id: existing.id },
              data: {
                marksObtained: toDecimal(m.marksObtained),
                grade,
                enteredById: user.id,
                remarks: remarksStr,
              },
            });
            updatedCount++;
          } else {
            await tx.markEntry.create({
              data: {
                examSubjectId: m.examSubjectId,
                studentId: rec.studentId,
                marksObtained: toDecimal(m.marksObtained),
                grade,
                enteredById: user.id,
                remarks: remarksStr,
              },
            });
            importedCount++;
          }
        }
      }
    }
  });

  return {
    success: true,
    imported: importedCount,
    updated: updatedCount,
    skipped: skippedCount,
    failed: 0,
  };
}

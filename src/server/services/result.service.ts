import { Prisma, ResultStatus, ResultOutcome, SubjectType, ExamPublishStatus } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { decimalToNumber, schoolIdFromUser, toDecimal } from "@/server/lib/helpers";
import { writeAuditLog } from "@/server/services/audit.service";

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

  return prisma.$transaction(async (tx) => {
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

    return { success: true };
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

export async function listClassExams(classId: string, sessionId: string) {
  const { user } = await requirePermission("exam.view");
  const schoolId = schoolIdFromUser(user);

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
  sectionId: string;
  sessionId: string;
  search?: string;
}) {
  const { user } = await requirePermission("result.view");
  const schoolId = schoolIdFromUser(user);

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
      sectionId: filters.sectionId,
      sessionId: filters.sessionId,
      student: {
        schoolId,
        status: "ACTIVE",
        ...searchClause,
      },
    },
    include: {
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

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      admissionNo: student.admissionNo,
      rollNo: student.enrollments[0]?.rollNo ?? "—",
      classSection: `${student.enrollments[0]?.class.name}-${student.enrollments[0]?.section.name}`,
    },
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
  } | null;
}) {
  const { user } = await requirePermission("marks.create");
  const schoolId = schoolIdFromUser(user);

  const student = await prisma.student.findFirst({
    where: { id: input.studentId, schoolId },
  });
  if (!student) throw new Error("Student not found");

  return prisma.$transaction(async (tx) => {
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
      const percent = maxMarks > 0 ? (m.marksObtained / maxMarks) * 100 : 0;
      const scales = await tx.gradeScale.findMany({
        where: { schoolId },
        orderBy: { minPercent: "desc" },
      });
      let grade = "E";
      for (const scale of scales) {
        const min = decimalToNumber(scale.minPercent);
        const max = decimalToNumber(scale.maxPercent);
        if (percent >= min && percent <= max) {
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
    if (input.termDetail) {
      await tx.studentTermResult.upsert({
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
          status: input.termDetail.status ?? ResultStatus.DRAFT,
        },
        update: {
          workingDays: input.termDetail.workingDays ?? null,
          presentDays: input.termDetail.presentDays ?? null,
          remarksMid: input.termDetail.remarksMid ?? null,
          remarksFinal: input.termDetail.remarksFinal ?? null,
          resultOutcome: input.termDetail.resultOutcome ?? null,
          principalRemarks: input.termDetail.principalRemarks ?? null,
          status: input.termDetail.status ?? undefined,
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

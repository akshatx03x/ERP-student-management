import { Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { getBrandingBySchoolId } from "@/server/services/branding.service";
import {
  decimalToNumber,
  parsePagination,
  schoolIdFromUser,
  toDecimal,
} from "@/server/lib/helpers";
import { formatDate } from "@/lib/utils";
import { parseOrThrow } from "@/server/validators/common";
import {
  createExamSchema,
  createExamSubjectSchema,
  createExamTypeSchema,
  generateReportCardSchema,
  listExamsSchema,
  markEntrySchema,
  type CreateExamInput,
  type CreateExamSubjectInput,
  type CreateExamTypeInput,
  type GenerateReportCardInput,
  type MarkEntryInput,
} from "@/server/validators/exam.validator";

async function resolveGrade(schoolId: string, percent: number): Promise<string | null> {
  const scales = await prisma.gradeScale.findMany({
    where: { schoolId },
    orderBy: { minPercent: "desc" },
  });
  for (const scale of scales) {
    const min = decimalToNumber(scale.minPercent);
    const max = decimalToNumber(scale.maxPercent);
    if (percent >= min && percent <= max) return scale.grade;
  }
  return null;
}

export async function listExamTypes(sessionId: string) {
  const { user } = await requirePermission("exam.view");
  const schoolId = schoolIdFromUser(user);

  const session = await prisma.academicSession.findFirst({
    where: { id: sessionId, schoolId },
  });
  if (!session) throw new Error("Session not found");

  return prisma.examType.findMany({
    where: { sessionId },
    orderBy: { name: "asc" },
  });
}

export async function createExamType(input: CreateExamTypeInput) {
  const { user } = await requirePermission("exam.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createExamTypeSchema, input);

  const session = await prisma.academicSession.findFirst({
    where: { id: data.sessionId, schoolId },
  });
  if (!session) throw new Error("Session not found");

  const dup = await prisma.examType.findUnique({
    where: { sessionId_name: { sessionId: data.sessionId, name: data.name } },
  });
  if (dup) throw new Error(`Exam type "${data.name}" already exists`);

  return prisma.$transaction(async (tx) => {
    const examType = await tx.examType.create({ data });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "exam",
        entityType: "ExamType",
        entityId: examType.id,
        newValue: examType,
      },
      tx,
    );
    return examType;
  });
}

export async function listExams(input?: {
  page?: number;
  pageSize?: number;
  sessionId?: string;
  classId?: string;
}) {
  const { user } = await requirePermission("exam.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listExamsSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    session: { schoolId },
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.classId ? { classId: params.classId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.exam.findMany({
      where,
      include: {
        examType: true,
        class: true,
        session: true,
        _count: { select: { subjects: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.exam.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getExam(examId: string) {
  const { user } = await requirePermission("exam.view");
  const schoolId = schoolIdFromUser(user);

  const exam = await prisma.exam.findFirst({
    where: { id: examId, session: { schoolId } },
    include: {
      examType: true,
      class: true,
      session: true,
      subjects: {
        include: {
          subject: true,
          markEntries: {
            include: {
              student: { select: { id: true, fullName: true, admissionNo: true } },
            },
          },
        },
      },
    },
  });
  if (!exam) throw new Error("Exam not found");
  return exam;
}

export async function createExam(input: CreateExamInput) {
  const { user } = await requirePermission("exam.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createExamSchema, input);

  const [session, examType, cls] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.examType.findFirst({ where: { id: data.examTypeId, sessionId: data.sessionId } }),
    prisma.class.findFirst({ where: { id: data.classId, schoolId } }),
  ]);
  if (!session || !examType || !cls) throw new Error("Invalid session, exam type, or class");

  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({ data });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "exam",
        entityType: "Exam",
        entityId: exam.id,
        newValue: exam,
      },
      tx,
    );
    return exam;
  });
}

export async function createExamSubject(input: CreateExamSubjectInput) {
  const { user } = await requirePermission("marks.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createExamSubjectSchema, input);

  const exam = await prisma.exam.findUnique({
    where: { id: data.examId },
    include: { session: true },
  });
  if (!exam || exam.session.schoolId !== schoolId) throw new Error("Exam not found");

  const subject = await prisma.subject.findFirst({
    where: { id: data.subjectId, schoolId },
  });
  if (!subject) throw new Error("Subject not found");

  if (data.passMarks > data.maxMarks) {
    throw new Error("Pass marks cannot exceed max marks");
  }

  return prisma.$transaction(async (tx) => {
    const examSubject = await tx.examSubject.create({
      data: {
        examId: data.examId,
        subjectId: data.subjectId,
        maxMarks: toDecimal(data.maxMarks),
        passMarks: toDecimal(data.passMarks),
      },
      include: { subject: true },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "exam",
        entityType: "ExamSubject",
        entityId: examSubject.id,
        newValue: examSubject,
      },
      tx,
    );
    return examSubject;
  });
}

export async function enterMarks(input: MarkEntryInput) {
  const { user } = await requirePermission("marks.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(markEntrySchema, input);

  const examSubject = await prisma.examSubject.findUnique({
    where: { id: data.examSubjectId },
    include: { exam: { include: { session: true } } },
  });
  if (!examSubject || examSubject.exam.session.schoolId !== schoolId) {
    throw new Error("Exam subject not found");
  }

  const maxMarks = decimalToNumber(examSubject.maxMarks);

  for (const entry of data.entries) {
    if (entry.marksObtained > maxMarks) {
      throw new Error(`Marks cannot exceed ${maxMarks} for ${entry.studentId}`);
    }
    const student = await prisma.student.findFirst({
      where: { id: entry.studentId, schoolId },
    });
    if (!student) throw new Error(`Student ${entry.studentId} not found`);
  }

  return prisma.$transaction(async (tx) => {
    const saved = [];
    for (const entry of data.entries) {
      const percent = maxMarks > 0 ? (entry.marksObtained / maxMarks) * 100 : 0;
      const grade = await resolveGrade(schoolId, percent);

      const mark = await tx.markEntry.upsert({
        where: {
          examSubjectId_studentId: {
            examSubjectId: data.examSubjectId,
            studentId: entry.studentId,
          },
        },
        create: {
          examSubjectId: data.examSubjectId,
          studentId: entry.studentId,
          marksObtained: toDecimal(entry.marksObtained),
          grade,
          remarks: entry.remarks,
          enteredById: user.id,
        },
        update: {
          marksObtained: toDecimal(entry.marksObtained),
          grade,
          remarks: entry.remarks,
          enteredById: user.id,
        },
      });
      saved.push(mark);
    }

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "marks",
        entityType: "MarkEntry",
        entityId: data.examSubjectId,
        newValue: { count: saved.length },
      },
      tx,
    );

    return { saved: saved.length, entries: saved };
  });
}

export async function getStudentMarks(studentId: string, sessionId: string) {
  const { user } = await requirePermission("result.view");
  const schoolId = schoolIdFromUser(user);

  if (user.role === Role.STUDENT && user.studentId !== studentId) {
    throw new Error("FORBIDDEN");
  }

  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw new Error("Student not found");

  return prisma.markEntry.findMany({
    where: {
      studentId,
      examSubject: { exam: { sessionId } },
    },
    include: {
      examSubject: {
        include: {
          subject: true,
          exam: { include: { examType: true, class: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function generateReportCard(input: GenerateReportCardInput) {
  const { user } = await requirePermission("result.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(generateReportCardSchema, input);

  if (user.role === Role.STUDENT && user.studentId !== data.studentId) {
    throw new Error("FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: { id: data.studentId, schoolId },
    include: {
      family: true,
      enrollments: {
        where: { sessionId: data.sessionId },
        include: { class: true, section: true, session: true },
      },
    },
  });
  if (!student) throw new Error("Student not found");

  const enrollment = student.enrollments[0];
  if (!enrollment) throw new Error("Student is not enrolled in this session");

  const marks = await prisma.markEntry.findMany({
    where: {
      studentId: data.studentId,
      examSubject: {
        exam: {
          sessionId: data.sessionId,
          ...(data.examId ? { id: data.examId } : {}),
        },
      },
    },
    include: {
      examSubject: {
        include: {
          subject: true,
          exam: { include: { examType: true } },
        },
      },
    },
  });

  const branding = await getBrandingBySchoolId(schoolId);
  let totalObtained = 0;
  let totalMax = 0;

  const subjects = marks.map((m) => {
    const obtained = decimalToNumber(m.marksObtained);
    const max = decimalToNumber(m.examSubject.maxMarks);
    totalObtained += obtained;
    totalMax += max;
    return {
      subject: m.examSubject.subject.name,
      exam: m.examSubject.exam.name,
      examType: m.examSubject.exam.examType.name,
      marksObtained: obtained,
      maxMarks: max,
      grade: m.grade,
      passMarks: decimalToNumber(m.examSubject.passMarks),
      passed: obtained >= decimalToNumber(m.examSubject.passMarks),
    };
  });

  const overallPercent = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
  const overallGrade = await resolveGrade(schoolId, overallPercent);

  const snapshot = {
    student: {
      id: student.id,
      fullName: student.fullName,
      admissionNo: student.admissionNo,
      class: enrollment.class.name,
      section: enrollment.section.name,
      rollNo: enrollment.rollNo,
    },
    session: enrollment.session.name,
    branding: {
      schoolName: branding.schoolName,
      address: branding.address,
      reportCardFooter: branding.reportCardFooter,
      logoDocumentId: branding.logoDocumentId,
    },
    subjects,
    summary: {
      totalObtained,
      totalMax,
      overallPercent: Math.round(overallPercent * 100) / 100,
      overallGrade,
    },
    generatedAt: new Date().toISOString(),
    generatedBy: user.name,
  };

  return prisma.$transaction(async (tx) => {
    const reportCard = await tx.reportCard.create({
      data: {
        studentId: data.studentId,
        sessionId: data.sessionId,
        examId: data.examId,
        snapshot,
        publishedAt: new Date(),
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "result",
        entityType: "ReportCard",
        entityId: reportCard.id,
        newValue: { studentId: data.studentId },
      },
      tx,
    );

    return reportCard;
  });
}

export async function listReportCards(studentId: string) {
  const { user } = await requirePermission("result.view");
  const schoolId = schoolIdFromUser(user);

  if (user.role === Role.STUDENT && user.studentId !== studentId) {
    throw new Error("FORBIDDEN");
  }

  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw new Error("Student not found");

  return prisma.reportCard.findMany({
    where: { studentId },
    include: { session: true, exam: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteExam(examId: string) {
  const { user } = await requirePermission("exam.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await getExam(examId);

  return prisma.$transaction(async (tx) => {
    await tx.exam.delete({ where: { id: examId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "exam",
        entityType: "Exam",
        entityId: examId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

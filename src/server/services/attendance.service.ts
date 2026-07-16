import { AttendanceStatus, Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { getHolidayDateSet } from "@/server/services/holiday.service";
import {
  eachDayInRange,
  isWeekend,
  normalizeDateOnly,
  schoolIdFromUser,
} from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  listAttendanceSchema,
  markAttendanceSchema,
  monthlySummarySchema,
  type MarkAttendanceInput,
  type MonthlySummaryInput,
} from "@/server/validators/attendance.validator";

function countWorkingDays(
  days: Date[],
  holidayDates: Set<string>,
): number {
  return days.filter((d) => {
    const key = normalizeDateOnly(d).toISOString().slice(0, 10);
    return !isWeekend(d) && !holidayDates.has(key);
  }).length;
}

export async function markAttendance(input: MarkAttendanceInput) {
  const { user } = await requirePermission("attendance.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(markAttendanceSchema, input);
  const date = normalizeDateOnly(data.date);

  const [session, section] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.section.findUnique({ where: { id: data.sectionId }, include: { class: true } }),
  ]);
  if (!session || !section || section.class.schoolId !== schoolId) {
    throw new Error("Invalid session or section");
  }

  const enrolledIds = await prisma.studentEnrollment.findMany({
    where: { sessionId: data.sessionId, sectionId: data.sectionId, status: "ACTIVE" },
    select: { studentId: true },
  });
  const validStudentIds = new Set(enrolledIds.map((e) => e.studentId));

  for (const record of data.records) {
    if (!validStudentIds.has(record.studentId)) {
      throw new Error(`Student ${record.studentId} is not enrolled in this section`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const record of data.records) {
      const saved = await tx.attendanceRecord.upsert({
        where: {
          studentId_date: { studentId: record.studentId, date },
        },
        create: {
          sessionId: data.sessionId,
          studentId: record.studentId,
          date,
          status: record.status,
          remarks: record.remarks,
          markedById: user.id,
        },
        update: {
          status: record.status,
          remarks: record.remarks,
          markedById: user.id,
        },
      });
      results.push(saved);
    }

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "attendance",
        entityType: "AttendanceRecord",
        entityId: `${data.sectionId}:${date.toISOString()}`,
        newValue: { count: results.length, sectionId: data.sectionId, date },
      },
      tx,
    );

    return { marked: results.length, records: results };
  });
}

export async function listAttendanceForSection(input: {
  sessionId: string;
  sectionId: string;
  date: Date | string;
}) {
  const { user } = await requirePermission("attendance.view");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(listAttendanceSchema, input);
  const date = normalizeDateOnly(data.date);

  const section = await prisma.section.findUnique({
    where: { id: data.sectionId },
    include: { class: true },
  });
  if (!section || section.class.schoolId !== schoolId) throw new Error("Section not found");

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { sessionId: data.sessionId, sectionId: data.sectionId, status: "ACTIVE" },
    include: {
      student: {
        select: { id: true, fullName: true, admissionNo: true },
      },
    },
    orderBy: { rollNo: "asc" },
  });

  const studentIds = enrollments.map((e) => e.studentId);
  const records = await prisma.attendanceRecord.findMany({
    where: { sessionId: data.sessionId, date, studentId: { in: studentIds } },
  });
  const recordMap = new Map(records.map((r) => [r.studentId, r]));

  return enrollments.map((e) => ({
    student: e.student,
    rollNo: e.rollNo,
    attendance: recordMap.get(e.studentId) ?? null,
  }));
}

export async function getStudentAttendance(input: {
  sessionId: string;
  studentId: string;
  fromDate: Date | string;
  toDate: Date | string;
}) {
  const { user } = await requirePermission("attendance.view");
  const schoolId = schoolIdFromUser(user);

  if (user.role === Role.STUDENT && user.studentId !== input.studentId) {
    throw new Error("FORBIDDEN");
  }

  const student = await prisma.student.findFirst({
    where: { id: input.studentId, schoolId },
  });
  if (!student) throw new Error("Student not found");

  const from = normalizeDateOnly(input.fromDate);
  const to = normalizeDateOnly(input.toDate);

  return prisma.attendanceRecord.findMany({
    where: {
      sessionId: input.sessionId,
      studentId: input.studentId,
      date: { gte: from, lte: to },
    },
    orderBy: { date: "asc" },
  });
}

export async function getMonthlyAttendanceSummary(input: MonthlySummaryInput) {
  const { user } = await requirePermission("attendance.view");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(monthlySummarySchema, input);

  if (user.role === Role.STUDENT) {
    if (!data.studentId || data.studentId !== user.studentId) {
      throw new Error("FORBIDDEN");
    }
  }

  const monthStart = new Date(Date.UTC(data.year, data.month - 1, 1));
  const monthEnd = new Date(Date.UTC(data.year, data.month, 0));
  const holidayDates = await getHolidayDateSet(schoolId, monthStart, monthEnd);
  const allDays = eachDayInRange(monthStart, monthEnd);
  const workingDays = countWorkingDays(allDays, holidayDates);

  let studentIds: string[] = [];

  if (data.studentId) {
    studentIds = [data.studentId];
  } else if (data.sectionId) {
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        sessionId: data.sessionId,
        sectionId: data.sectionId,
        status: "ACTIVE",
      },
      select: { studentId: true },
    });
    studentIds = enrollments.map((e) => e.studentId);
  } else {
    throw new Error("Either studentId or sectionId is required");
  }

  const records = await prisma.attendanceRecord.findMany({
    where: {
      sessionId: data.sessionId,
      studentId: { in: studentIds },
      date: { gte: monthStart, lte: monthEnd },
    },
    include: {
      student: { select: { id: true, fullName: true, admissionNo: true } },
    },
  });

  type Summary = {
    studentId: string;
    studentName: string;
    admissionNo: string;
    present: number;
    absent: number;
    late: number;
    halfDay: number;
    excused: number;
    markedDays: number;
    workingDays: number;
    percentage: number;
  };

  const byStudent = new Map<string, Summary>();

  for (const sid of studentIds) {
    const student = records.find((r) => r.studentId === sid)?.student;
    if (!student && data.studentId) {
      const s = await prisma.student.findFirst({
        where: { id: sid, schoolId },
        select: { id: true, fullName: true, admissionNo: true },
      });
      if (!s) continue;
      byStudent.set(sid, {
        studentId: sid,
        studentName: s.fullName,
        admissionNo: s.admissionNo,
        present: 0,
        absent: 0,
        late: 0,
        halfDay: 0,
        excused: 0,
        markedDays: 0,
        workingDays,
        percentage: 0,
      });
    } else if (student) {
      byStudent.set(sid, {
        studentId: sid,
        studentName: student.fullName,
        admissionNo: student.admissionNo,
        present: 0,
        absent: 0,
        late: 0,
        halfDay: 0,
        excused: 0,
        markedDays: 0,
        workingDays,
        percentage: 0,
      });
    }
  }

  for (const record of records) {
    const dayKey = normalizeDateOnly(record.date).toISOString().slice(0, 10);
    if (isWeekend(record.date) || holidayDates.has(dayKey)) continue;

    const summary = byStudent.get(record.studentId);
    if (!summary) continue;

    summary.markedDays += 1;
    switch (record.status) {
      case AttendanceStatus.PRESENT:
        summary.present += 1;
        break;
      case AttendanceStatus.ABSENT:
        summary.absent += 1;
        break;
      case AttendanceStatus.LATE:
        summary.late += 1;
        break;
      case AttendanceStatus.HALF_DAY:
        summary.halfDay += 1;
        break;
      case AttendanceStatus.EXCUSED:
        summary.excused += 1;
        break;
    }
  }

  for (const summary of byStudent.values()) {
    const attended = summary.present + summary.late + summary.halfDay * 0.5 + summary.excused;
    summary.percentage =
      workingDays > 0 ? Math.round((attended / workingDays) * 10000) / 100 : 0;
  }

  return {
    month: data.month,
    year: data.year,
    workingDays,
    holidays: holidayDates.size,
    summaries: [...byStudent.values()].sort((a, b) =>
      a.studentName.localeCompare(b.studentName),
    ),
  };
}

import { Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  createTimetableSlotSchema,
  timetableViewSchema,
  updateTimetableSlotSchema,
  type CreateTimetableSlotInput,
  type TimetableViewInput,
  type UpdateTimetableSlotInput,
} from "@/server/validators/timetable.validator";

async function resolveSectionForStudent(schoolId: string, sessionId: string, studentId: string) {
  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { studentId_sessionId: { studentId, sessionId } },
    include: { section: { include: { class: true } } },
  });
  if (!enrollment || enrollment.section.class.schoolId !== schoolId) {
    throw new Error("Student enrollment not found for this session");
  }
  return enrollment.sectionId;
}

export async function getTimetable(input: TimetableViewInput) {
  const { user } = await requirePermission("timetable.view");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(timetableViewSchema, input);

  const session = await prisma.academicSession.findFirst({
    where: { id: data.sessionId, schoolId },
  });
  if (!session) throw new Error("Session not found");

  let sectionId = data.sectionId;
  let staffProfileId = data.staffProfileId;

  if (user.role === Role.STUDENT) {
    if (!user.studentId) throw new Error("FORBIDDEN");
    sectionId = await resolveSectionForStudent(schoolId, data.sessionId, user.studentId);
  } else if (data.studentId) {
    sectionId = await resolveSectionForStudent(schoolId, data.sessionId, data.studentId);
  }

  if (user.role === Role.TEACHER && user.staffProfileId && !staffProfileId) {
    staffProfileId = user.staffProfileId;
  }

  const where = {
    sessionId: data.sessionId,
    ...(sectionId ? { sectionId } : {}),
    ...(staffProfileId ? { staffProfileId } : {}),
  };

  return prisma.timetableSlot.findMany({
    where,
    include: {
      section: { include: { class: true } },
      subject: true,
      staffProfile: { select: { id: true, fullName: true, employeeCode: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
  });
}

export async function createTimetableSlot(input: CreateTimetableSlotInput) {
  const { user } = await requirePermission("timetable.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createTimetableSlotSchema, input);

  const [session, section, subject, staff] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.section.findUnique({ where: { id: data.sectionId }, include: { class: true } }),
    prisma.subject.findFirst({ where: { id: data.subjectId, schoolId } }),
    prisma.staffProfile.findFirst({ where: { id: data.staffProfileId, schoolId } }),
  ]);
  if (!session || !section || section.class.schoolId !== schoolId) {
    throw new Error("Invalid session or section");
  }
  if (!subject || !staff) throw new Error("Invalid subject or staff");

  if (data.startTime >= data.endTime) {
    throw new Error("Start time must be before end time");
  }

  const conflict = await prisma.timetableSlot.findFirst({
    where: {
      sessionId: data.sessionId,
      sectionId: data.sectionId,
      dayOfWeek: data.dayOfWeek,
      periodNumber: data.periodNumber,
    },
  });
  if (conflict) {
    throw new Error("A slot already exists for this section, day, and period");
  }

  return prisma.$transaction(async (tx) => {
    const slot = await tx.timetableSlot.create({ data });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "timetable",
        entityType: "TimetableSlot",
        entityId: slot.id,
        newValue: slot,
      },
      tx,
    );
    return slot;
  });
}

export async function updateTimetableSlot(input: UpdateTimetableSlotInput) {
  const { user } = await requirePermission("timetable.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateTimetableSlotSchema, input);

  const existing = await prisma.timetableSlot.findUnique({
    where: { id: data.id },
    include: { session: true },
  });
  if (!existing || existing.session.schoolId !== schoolId) {
    throw new Error("Timetable slot not found");
  }

  const { id, ...rest } = data;

  if (rest.startTime && rest.endTime && rest.startTime >= rest.endTime) {
    throw new Error("Start time must be before end time");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.timetableSlot.update({ where: { id }, data: rest });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "timetable",
        entityType: "TimetableSlot",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteTimetableSlot(slotId: string) {
  const { user } = await requirePermission("timetable.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.timetableSlot.findUnique({
    where: { id: slotId },
    include: { session: true },
  });
  if (!existing || existing.session.schoolId !== schoolId) {
    throw new Error("Timetable slot not found");
  }

  return prisma.$transaction(async (tx) => {
    await tx.timetableSlot.delete({ where: { id: slotId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "timetable",
        entityType: "TimetableSlot",
        entityId: slotId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

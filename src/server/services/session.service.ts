import { EnrollmentStatus, SessionStatus } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import {
  parsePagination,
  schoolIdFromUser,
} from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  createSessionSchema,
  listSessionsSchema,
  promoteStudentsSchema,
  updateSessionSchema,
  type CreateSessionInput,
  type PromoteStudentsInput,
  type UpdateSessionInput,
} from "@/server/validators/session.validator";

export async function listSessions(input?: { page?: number; pageSize?: number; search?: string }) {
  const { user } = await requirePermission("session.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listSessionsSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    ...(params.search
      ? { name: { contains: params.search, mode: "insensitive" as const } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.academicSession.findMany({
      where,
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
      skip,
      take,
    }),
    prisma.academicSession.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getSession(sessionId: string) {
  const { user } = await requirePermission("session.view");
  const schoolId = schoolIdFromUser(user);

  const session = await prisma.academicSession.findFirst({
    where: { id: sessionId, schoolId },
  });
  if (!session) throw new Error("Academic session not found");
  return session;
}

export async function createSession(input: CreateSessionInput) {
  const { user } = await requirePermission("session.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createSessionSchema, input);

  const existing = await prisma.academicSession.findUnique({
    where: { schoolId_name: { schoolId, name: data.name } },
  });
  if (existing) throw new Error(`Session "${data.name}" already exists`);

  return prisma.$transaction(async (tx) => {
    const session = await tx.academicSession.create({
      data: {
        schoolId,
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "session",
        entityType: "AcademicSession",
        entityId: session.id,
        newValue: session,
      },
      tx,
    );

    return session;
  });
}

export async function updateSession(input: UpdateSessionInput) {
  const { user } = await requirePermission("session.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateSessionSchema, input);

  const existing = await getSession(data.id);

  if (data.name && data.name !== existing.name) {
    const dup = await prisma.academicSession.findUnique({
      where: { schoolId_name: { schoolId, name: data.name } },
    });
    if (dup) throw new Error(`Session "${data.name}" already exists`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.academicSession.update({
      where: { id: data.id },
      data: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "session",
        entityType: "AcademicSession",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );

    return updated;
  });
}

export async function deleteSession(sessionId: string) {
  const { user } = await requirePermission("session.delete");
  const schoolId = schoolIdFromUser(user);
  const existing = await getSession(sessionId);

  if (existing.isCurrent) throw new Error("Cannot delete the current academic session");

  const enrollmentCount = await prisma.studentEnrollment.count({
    where: { sessionId },
  });
  if (enrollmentCount > 0) {
    throw new Error("Cannot delete session with existing enrollments");
  }

  return prisma.$transaction(async (tx) => {
    await tx.academicSession.delete({ where: { id: sessionId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "session",
        entityType: "AcademicSession",
        entityId: sessionId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

export async function setCurrentSession(sessionId: string) {
  const { user } = await requirePermission("session.update");
  const schoolId = schoolIdFromUser(user);
  const session = await getSession(sessionId);

  if (session.status === SessionStatus.ARCHIVED || session.status === SessionStatus.CLOSED) {
    throw new Error("Cannot set a closed or archived session as current");
  }

  return prisma.$transaction(async (tx) => {
    await tx.academicSession.updateMany({
      where: { schoolId, isCurrent: true },
      data: { isCurrent: false },
    });

    const updated = await tx.academicSession.update({
      where: { id: sessionId },
      data: { isCurrent: true, status: SessionStatus.ACTIVE },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "session",
        entityType: "AcademicSession",
        entityId: sessionId,
        newValue: { isCurrent: true },
      },
      tx,
    );

    return updated;
  });
}

export async function closeSession(sessionId: string) {
  const { user } = await requirePermission("session.update");
  const schoolId = schoolIdFromUser(user);
  const session = await getSession(sessionId);

  if (session.isCurrent) throw new Error("Unset current session before closing");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.academicSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.CLOSED },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "session",
        entityType: "AcademicSession",
        entityId: sessionId,
        newValue: { status: SessionStatus.CLOSED },
      },
      tx,
    );

    return updated;
  });
}

export async function archiveSession(sessionId: string) {
  const { user } = await requirePermission("session.update");
  const schoolId = schoolIdFromUser(user);
  const session = await getSession(sessionId);

  if (session.isCurrent) throw new Error("Cannot archive the current session");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.academicSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.ARCHIVED, isCurrent: false },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "session",
        entityType: "AcademicSession",
        entityId: sessionId,
        newValue: { status: SessionStatus.ARCHIVED },
      },
      tx,
    );

    return updated;
  });
}

export async function promoteStudents(input: PromoteStudentsInput) {
  const { user } = await requirePermission("session.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(promoteStudentsSchema, input);

  const [fromSession, toSession] = await Promise.all([
    getSession(data.fromSessionId),
    getSession(data.toSessionId),
  ]);

  if (fromSession.id === toSession.id) {
    throw new Error("Source and target sessions must be different");
  }

  const studentIds = data.mappings.map((m) => m.studentId);
  const targetClassIds = Array.from(new Set(data.mappings.map((m) => m.toClassId)));
  const targetSectionIds = Array.from(new Set(data.mappings.map((m) => m.toSectionId)));

  // Pre-fetch all required validation data in parallel
  const [students, fromEnrollments, classes, sections] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { id: true, fullName: true },
    }),
    prisma.studentEnrollment.findMany({
      where: {
        studentId: { in: studentIds },
        sessionId: data.fromSessionId,
      },
    }),
    prisma.class.findMany({
      where: { id: { in: targetClassIds }, schoolId },
    }),
    prisma.section.findMany({
      where: { id: { in: targetSectionIds } },
    }),
  ]);

  // Map data for O(1) in-memory checks
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const enrollmentMap = new Map(fromEnrollments.map((e) => [e.studentId, e]));
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  // In-memory validation
  for (const mapping of data.mappings) {
    const student = studentMap.get(mapping.studentId);
    if (!student) {
      throw new Error(`Student ${mapping.studentId} not found`);
    }

    const fromEnrollment = enrollmentMap.get(mapping.studentId);
    if (!fromEnrollment) {
      throw new Error(`No enrollment found for student ${student.fullName} in source session`);
    }

    const toClass = classMap.get(mapping.toClassId);
    const toSection = sectionMap.get(mapping.toSectionId);
    if (!toClass || !toSection) {
      throw new Error(`Invalid target class/section for student ${student.fullName}`);
    }
    if (toSection.classId !== mapping.toClassId) {
      throw new Error(`Section ${toSection.name} does not belong to target class ${toClass.name}`);
    }
  }

  const results: Array<{ studentId: string; enrollmentId: string }> = [];

  await prisma.$transaction(async (tx) => {
    const promotionResults = await Promise.all(
      data.mappings.map(async (mapping) => {
        const fromEnrollment = enrollmentMap.get(mapping.studentId)!;

        await tx.studentEnrollment.update({
          where: { id: fromEnrollment.id },
          data: { status: EnrollmentStatus.PROMOTED },
        });

        const newEnrollment = await tx.studentEnrollment.upsert({
          where: {
            studentId_sessionId: {
              studentId: mapping.studentId,
              sessionId: data.toSessionId,
            },
          },
          create: {
            studentId: mapping.studentId,
            sessionId: data.toSessionId,
            classId: mapping.toClassId,
            sectionId: mapping.toSectionId,
            rollNo: mapping.rollNo,
            status: EnrollmentStatus.ACTIVE,
          },
          update: {
            classId: mapping.toClassId,
            sectionId: mapping.toSectionId,
            rollNo: mapping.rollNo,
            status: EnrollmentStatus.ACTIVE,
          },
        });

        await tx.promotionHistory.create({
          data: {
            studentId: mapping.studentId,
            fromSessionId: data.fromSessionId,
            toSessionId: data.toSessionId,
            fromClassId: fromEnrollment.classId,
            toClassId: mapping.toClassId,
            fromSectionId: fromEnrollment.sectionId,
            toSectionId: mapping.toSectionId,
            byUserId: user.id,
            notes: mapping.notes,
          },
        });

        return { studentId: mapping.studentId, enrollmentId: newEnrollment.id };
      })
    );

    results.push(...promotionResults);

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "session",
        entityType: "PromotionHistory",
        entityId: data.toSessionId,
        newValue: { promoted: results.length },
      },
      tx,
    );
  });

  return { promoted: results.length, results };
}

export async function getCurrentSession() {
  const { user } = await requirePermission("session.view");
  const schoolId = schoolIdFromUser(user);

  const session = await prisma.academicSession.findFirst({
    where: { schoolId, isCurrent: true },
  });
  return session;
}

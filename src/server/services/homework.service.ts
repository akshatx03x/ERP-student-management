import { Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  createHomeworkSchema,
  listHomeworkSchema,
  type CreateHomeworkInput,
} from "@/server/validators/homework.validator";

async function resolveStaffProfileId(user: {
  role: Role;
  staffProfileId: string | null;
}): Promise<string> {
  if (!user.staffProfileId) {
    throw new Error("Staff profile required to manage homework");
  }
  return user.staffProfileId;
}

export async function listHomework(input?: {
  page?: number;
  pageSize?: number;
  sessionId?: string;
  sectionId?: string;
  studentId?: string;
}) {
  const { user } = await requirePermission("homework.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listHomeworkSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  let sectionId = params.sectionId;

  if (user.role === Role.STUDENT && user.studentId) {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: {
        studentId: user.studentId,
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
    });
    if (!enrollment) return { items: [], total: 0, page, pageSize };
    sectionId = enrollment.sectionId;
  } else if (params.studentId) {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: {
        studentId: params.studentId,
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
    });
    if (enrollment) sectionId = enrollment.sectionId;
  }

  const where = {
    section: { class: { schoolId } },
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(sectionId ? { sectionId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.homework.findMany({
      where,
      include: {
        subject: true,
        section: { include: { class: true } },
        session: true,
        createdByStaff: { select: { id: true, fullName: true } },
        attachments: { include: { document: { select: { id: true, fileName: true, mimeType: true } } } },
      },
      orderBy: { dueDate: "desc" },
      skip,
      take,
    }),
    prisma.homework.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getHomework(homeworkId: string) {
  const { user } = await requirePermission("homework.view");
  const schoolId = schoolIdFromUser(user);

  const homework = await prisma.homework.findFirst({
    where: { id: homeworkId, section: { class: { schoolId } } },
    include: {
      subject: true,
      section: { include: { class: true } },
      session: true,
      createdByStaff: true,
      attachments: { include: { document: true } },
    },
  });
  if (!homework) throw new Error("Homework not found");

  if (user.role === Role.STUDENT && user.studentId) {
    const enrolled = await prisma.studentEnrollment.findFirst({
      where: {
        studentId: user.studentId,
        sectionId: homework.sectionId,
        sessionId: homework.sessionId,
        status: "ACTIVE",
      },
    });
    if (!enrolled) throw new Error("FORBIDDEN");
  }

  return homework;
}

export async function createHomework(input: CreateHomeworkInput) {
  const { user } = await requirePermission("homework.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createHomeworkSchema, input);
  const staffProfileId = await resolveStaffProfileId(user);

  const [session, section, subject] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.section.findUnique({ where: { id: data.sectionId }, include: { class: true } }),
    prisma.subject.findFirst({ where: { id: data.subjectId, schoolId } }),
  ]);
  if (!session || !section || section.class.schoolId !== schoolId) {
    throw new Error("Invalid session or section");
  }
  if (!subject) throw new Error("Subject not found");

  if (data.documentIds?.length) {
    const docs = await prisma.document.findMany({
      where: { id: { in: data.documentIds }, schoolId },
    });
    if (docs.length !== data.documentIds.length) {
      throw new Error("One or more attachment documents not found");
    }
  }

  return prisma.$transaction(async (tx) => {
    const homework = await tx.homework.create({
      data: {
        sessionId: data.sessionId,
        sectionId: data.sectionId,
        subjectId: data.subjectId,
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
        createdByStaffId: staffProfileId,
        ...(data.documentIds?.length
          ? {
              attachments: {
                create: data.documentIds.map((documentId) => ({ documentId })),
              },
            }
          : {}),
      },
      include: {
        subject: true,
        attachments: { include: { document: true } },
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "homework",
        entityType: "Homework",
        entityId: homework.id,
        newValue: homework,
      },
      tx,
    );

    return homework;
  });
}

export async function deleteHomework(homeworkId: string) {
  const { user } = await requirePermission("homework.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await getHomework(homeworkId);

  if (user.role === Role.TEACHER && existing.createdByStaffId !== user.staffProfileId) {
    throw new Error("FORBIDDEN");
  }

  return prisma.$transaction(async (tx) => {
    await tx.homework.delete({ where: { id: homeworkId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "homework",
        entityType: "Homework",
        entityId: homeworkId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

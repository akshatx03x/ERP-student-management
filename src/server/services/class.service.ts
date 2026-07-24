import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  assignClassSubjectSchema,
  assignClassTeacherSchema,
  createClassSchema,
  createSectionSchema,
  createSubjectSchema,
  listClassSchema,
  updateClassSchema,
  updateSectionSchema,
  updateSubjectSchema,
  type AssignClassSubjectInput,
  type AssignClassTeacherInput,
  type CreateClassInput,
  type CreateSectionInput,
  type CreateSubjectInput,
  type UpdateClassInput,
  type UpdateSectionInput,
  type UpdateSubjectInput,
} from "@/server/validators/class.validator";

// ── Classes ──

export async function listClasses(input?: {
  page?: number;
  pageSize?: number;
  search?: string;
  sessionId?: string;
}) {
  const { user } = await requirePermission("class.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listClassSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    ...(params.search
      ? { name: { contains: params.search, mode: "insensitive" as const } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.class.findMany({
      where,
      select: {
        id: true,
        name: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        sections: { select: { id: true, name: true, classId: true } },
        _count: { select: { sections: true, enrollments: true } },
      },
      orderBy: { sortOrder: "asc" },
      skip,
      take,
    }),
    prisma.class.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getClass(classId: string) {
  const { user } = await requirePermission("class.view");
  const schoolId = schoolIdFromUser(user);

  const cls = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    include: { sections: { orderBy: { name: "asc" } } },
  });
  if (!cls) throw new Error("Class not found");
  return cls;
}

export async function createClass(input: CreateClassInput) {
  const { user } = await requirePermission("class.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createClassSchema, input);

  const dup = await prisma.class.findUnique({
    where: { schoolId_name: { schoolId, name: data.name } },
  });
  if (dup) throw new Error(`Class "${data.name}" already exists`);

  return prisma.$transaction(async (tx) => {
    const cls = await tx.class.create({
      data: { schoolId, name: data.name, sortOrder: data.sortOrder },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "class",
        entityType: "Class",
        entityId: cls.id,
        newValue: cls,
      },
      tx,
    );
    return cls;
  });
}

export async function updateClass(input: UpdateClassInput) {
  const { user } = await requirePermission("class.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateClassSchema, input);
  const existing = await getClass(data.id);

  if (data.name && data.name !== existing.name) {
    const dup = await prisma.class.findUnique({
      where: { schoolId_name: { schoolId, name: data.name } },
    });
    if (dup) throw new Error(`Class "${data.name}" already exists`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.class.update({
      where: { id: data.id },
      data: { name: data.name, sortOrder: data.sortOrder },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "class",
        entityType: "Class",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteClass(classId: string) {
  const { user } = await requirePermission("class.delete");
  const schoolId = schoolIdFromUser(user);
  const existing = await getClass(classId);

  const enrollmentCount = await prisma.studentEnrollment.count({ where: { classId } });
  if (enrollmentCount > 0) throw new Error("Cannot delete class with active enrollments");

  return prisma.$transaction(async (tx) => {
    await tx.class.delete({ where: { id: classId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "class",
        entityType: "Class",
        entityId: classId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

// ── Sections ──

export async function listSections(classId: string, input?: { search?: string }) {
  await requirePermission("section.view");
  await getClass(classId);

  const where = {
    classId,
    ...(input?.search
      ? { name: { contains: input.search, mode: "insensitive" as const } }
      : {}),
  };

  return prisma.section.findMany({
    where,
    orderBy: { name: "asc" },
    include: { _count: { select: { enrollments: true } } },
  });
}

export async function createSection(input: CreateSectionInput) {
  const { user } = await requirePermission("section.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createSectionSchema, input);
  await getClass(data.classId);

  const dup = await prisma.section.findUnique({
    where: { classId_name: { classId: data.classId, name: data.name } },
  });
  if (dup) throw new Error(`Section "${data.name}" already exists in this class`);

  return prisma.$transaction(async (tx) => {
    const section = await tx.section.create({
      data: { classId: data.classId, name: data.name },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "section",
        entityType: "Section",
        entityId: section.id,
        newValue: section,
      },
      tx,
    );
    return section;
  });
}

export async function updateSection(input: UpdateSectionInput) {
  const { user } = await requirePermission("section.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateSectionSchema, input);

  const section = await prisma.section.findUnique({
    where: { id: data.id },
    include: { class: true },
  });
  if (!section || section.class.schoolId !== schoolId) {
    throw new Error("Section not found");
  }

  if (data.name && data.name !== section.name) {
    const dup = await prisma.section.findUnique({
      where: { classId_name: { classId: section.classId, name: data.name } },
    });
    if (dup) throw new Error(`Section "${data.name}" already exists`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.section.update({
      where: { id: data.id },
      data: { name: data.name },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "section",
        entityType: "Section",
        entityId: updated.id,
        oldValue: section,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteSection(sectionId: string) {
  const { user } = await requirePermission("section.delete");
  const schoolId = schoolIdFromUser(user);

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { class: true },
  });
  if (!section || section.class.schoolId !== schoolId) throw new Error("Section not found");

  const enrollmentCount = await prisma.studentEnrollment.count({ where: { sectionId } });
  if (enrollmentCount > 0) throw new Error("Cannot delete section with enrollments");

  return prisma.$transaction(async (tx) => {
    await tx.section.delete({ where: { id: sectionId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "section",
        entityType: "Section",
        entityId: sectionId,
        oldValue: section,
      },
      tx,
    );
    return { success: true };
  });
}

// ── Subjects ──

export async function listSubjects(input?: { page?: number; pageSize?: number; search?: string }) {
  const { user } = await requirePermission("subject.view");
  const schoolId = schoolIdFromUser(user);
  const { skip, take, page, pageSize } = parsePagination(input?.page, input?.pageSize);

  const where = {
    schoolId,
    ...(input?.search
      ? {
          OR: [
            { name: { contains: input.search, mode: "insensitive" as const } },
            { code: { contains: input.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.subject.findMany({ where, orderBy: { name: "asc" }, skip, take }),
    prisma.subject.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function createSubject(input: CreateSubjectInput) {
  const { user } = await requirePermission("subject.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createSubjectSchema, input);

  const [dupName, dupCode] = await Promise.all([
    prisma.subject.findUnique({ where: { schoolId_name: { schoolId, name: data.name } } }),
    prisma.subject.findUnique({ where: { schoolId_code: { schoolId, code: data.code } } }),
  ]);
  if (dupName) throw new Error(`Subject "${data.name}" already exists`);
  if (dupCode) throw new Error(`Subject code "${data.code}" already exists`);

  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({
      data: { schoolId, name: data.name, code: data.code },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "subject",
        entityType: "Subject",
        entityId: subject.id,
        newValue: subject,
      },
      tx,
    );
    return subject;
  });
}

export async function updateSubject(input: UpdateSubjectInput) {
  const { user } = await requirePermission("subject.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateSubjectSchema, input);

  const existing = await prisma.subject.findFirst({
    where: { id: data.id, schoolId },
  });
  if (!existing) throw new Error("Subject not found");

  if (data.name && data.name !== existing.name) {
    const dup = await prisma.subject.findUnique({
      where: { schoolId_name: { schoolId, name: data.name } },
    });
    if (dup) throw new Error(`Subject "${data.name}" already exists`);
  }
  if (data.code && data.code !== existing.code) {
    const dup = await prisma.subject.findUnique({
      where: { schoolId_code: { schoolId, code: data.code } },
    });
    if (dup) throw new Error(`Subject code "${data.code}" already exists`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.subject.update({
      where: { id: data.id },
      data: { name: data.name, code: data.code },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "subject",
        entityType: "Subject",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteSubject(subjectId: string) {
  const { user } = await requirePermission("subject.delete");
  const schoolId = schoolIdFromUser(user);

  const existing = await prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
  if (!existing) throw new Error("Subject not found");

  return prisma.$transaction(async (tx) => {
    await tx.subject.delete({ where: { id: subjectId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "subject",
        entityType: "Subject",
        entityId: subjectId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

// ── ClassSubjects ──

export async function listClassSubjects(sessionId: string, classId?: string) {
  const { user } = await requirePermission("subject.view");
  const schoolId = schoolIdFromUser(user);

  const session = await prisma.academicSession.findFirst({
    where: { id: sessionId, schoolId },
  });
  if (!session) throw new Error("Session not found");

  return prisma.classSubject.findMany({
    where: { sessionId, ...(classId ? { classId } : {}) },
    include: { subject: true, class: true },
    orderBy: [{ class: { sortOrder: "asc" } }, { subject: { name: "asc" } }],
  });
}

export async function assignClassSubject(input: AssignClassSubjectInput) {
  const { user } = await requirePermission("subject.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(assignClassSubjectSchema, input);

  const [session, cls, subject] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.class.findFirst({ where: { id: data.classId, schoolId } }),
    prisma.subject.findFirst({ where: { id: data.subjectId, schoolId } }),
  ]);
  if (!session || !cls || !subject) throw new Error("Invalid session, class, or subject");

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.classSubject.upsert({
      where: {
        sessionId_classId_subjectId: {
          sessionId: data.sessionId,
          classId: data.classId,
          subjectId: data.subjectId,
        },
      },
      create: {
        sessionId: data.sessionId,
        classId: data.classId,
        subjectId: data.subjectId,
      },
      update: {},
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "subject",
        entityType: "ClassSubject",
        entityId: assignment.id,
        newValue: assignment,
      },
      tx,
    );
    return assignment;
  });
}

export async function removeClassSubject(sessionId: string, classId: string, subjectId: string) {
  const { user } = await requirePermission("subject.delete");
  const schoolId = schoolIdFromUser(user);

  const assignment = await prisma.classSubject.findUnique({
    where: { sessionId_classId_subjectId: { sessionId, classId, subjectId } },
    include: { session: true },
  });
  if (!assignment || assignment.session.schoolId !== schoolId) {
    throw new Error("Class subject assignment not found");
  }

  return prisma.$transaction(async (tx) => {
    await tx.classSubject.delete({ where: { id: assignment.id } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "subject",
        entityType: "ClassSubject",
        entityId: assignment.id,
        oldValue: assignment,
      },
      tx,
    );
    return { success: true };
  });
}

// ── Class Teacher Assignments ──

export async function listClassTeachers(sessionId: string) {
  const { user } = await requirePermission("class.view");
  const schoolId = schoolIdFromUser(user);

  const session = await prisma.academicSession.findFirst({
    where: { id: sessionId, schoolId },
  });
  if (!session) throw new Error("Session not found");

  return prisma.classTeacherAssignment.findMany({
    where: { sessionId },
    include: {
      section: { include: { class: true } },
      staffProfile: true,
    },
    orderBy: [{ section: { class: { sortOrder: "asc" } } }, { section: { name: "asc" } }],
  });
}

export async function assignClassTeacher(input: AssignClassTeacherInput) {
  const { user } = await requirePermission("class.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(assignClassTeacherSchema, input);

  const [session, section, staff] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.section.findUnique({ where: { id: data.sectionId }, include: { class: true } }),
    prisma.staffProfile.findFirst({ where: { id: data.staffProfileId, schoolId } }),
  ]);
  if (!session) throw new Error("Session not found");
  if (!section || section.class.schoolId !== schoolId) throw new Error("Section not found");
  if (!staff) throw new Error("Staff member not found");

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.classTeacherAssignment.upsert({
      where: {
        sessionId_sectionId: { sessionId: data.sessionId, sectionId: data.sectionId },
      },
      create: {
        sessionId: data.sessionId,
        sectionId: data.sectionId,
        staffProfileId: data.staffProfileId,
      },
      update: { staffProfileId: data.staffProfileId },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "class",
        entityType: "ClassTeacherAssignment",
        entityId: assignment.id,
        newValue: assignment,
      },
      tx,
    );
    return assignment;
  });
}

export async function removeClassTeacher(sessionId: string, sectionId: string) {
  const { user } = await requirePermission("class.update");
  const schoolId = schoolIdFromUser(user);

  const assignment = await prisma.classTeacherAssignment.findUnique({
    where: { sessionId_sectionId: { sessionId, sectionId } },
    include: { session: true },
  });
  if (!assignment || assignment.session.schoolId !== schoolId) {
    throw new Error("Class teacher assignment not found");
  }

  return prisma.$transaction(async (tx) => {
    await tx.classTeacherAssignment.delete({ where: { id: assignment.id } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "class",
        entityType: "ClassTeacherAssignment",
        entityId: assignment.id,
        oldValue: assignment,
      },
      tx,
    );
    return { success: true };
  });
}

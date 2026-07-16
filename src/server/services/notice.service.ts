import { NoticeAudience, Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  createNoticeSchema,
  listNoticesSchema,
  updateNoticeSchema,
  type CreateNoticeInput,
  type UpdateNoticeInput,
} from "@/server/validators/notice.validator";

function audienceFilterForRole(role: Role): NoticeAudience[] {
  switch (role) {
    case Role.STUDENT:
      return [NoticeAudience.ALL, NoticeAudience.STUDENTS, NoticeAudience.PARENTS];
    case Role.TEACHER:
      return [NoticeAudience.ALL, NoticeAudience.STAFF, NoticeAudience.TEACHERS];
    case Role.ACCOUNTANT:
      return [NoticeAudience.ALL, NoticeAudience.STAFF];
    default:
      return Object.values(NoticeAudience);
  }
}

export async function listNotices(input?: {
  page?: number;
  pageSize?: number;
  audience?: NoticeAudience;
  activeOnly?: boolean;
}) {
  const { user } = await requirePermission("notice.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listNoticesSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const allowedAudiences = audienceFilterForRole(user.role);

  const where = {
    schoolId,
    ...(params.activeOnly ? { isActive: true, publishedAt: { lte: new Date() } } : {}),
    ...(params.audience
      ? { audience: params.audience }
      : { audience: { in: allowedAudiences } }),
  };

  const [items, total] = await Promise.all([
    prisma.notice.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.notice.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getNotice(noticeId: string) {
  const { user } = await requirePermission("notice.view");
  const schoolId = schoolIdFromUser(user);

  const notice = await prisma.notice.findFirst({
    where: { id: noticeId, schoolId },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!notice) throw new Error("Notice not found");

  const allowed = audienceFilterForRole(user.role);
  if (!allowed.includes(notice.audience)) {
    throw new Error("FORBIDDEN");
  }

  return notice;
}

export async function createNotice(input: CreateNoticeInput) {
  const { user } = await requirePermission("notice.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createNoticeSchema, input);

  return prisma.$transaction(async (tx) => {
    const notice = await tx.notice.create({
      data: {
        schoolId,
        title: data.title,
        body: data.body,
        audience: data.audience,
        publishedAt: data.publishedAt ?? new Date(),
        isActive: data.isActive,
        createdById: user.id,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "notice",
        entityType: "Notice",
        entityId: notice.id,
        newValue: notice,
      },
      tx,
    );

    return notice;
  });
}

export async function updateNotice(input: UpdateNoticeInput) {
  const { user } = await requirePermission("notice.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateNoticeSchema, input);

  const existing = await getNotice(data.id);
  const { id, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.notice.update({ where: { id }, data: rest });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "notice",
        entityType: "Notice",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteNotice(noticeId: string) {
  const { user } = await requirePermission("notice.delete");
  const schoolId = schoolIdFromUser(user);
  const existing = await getNotice(noticeId);

  return prisma.$transaction(async (tx) => {
    await tx.notice.delete({ where: { id: noticeId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "notice",
        entityType: "Notice",
        entityId: noticeId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

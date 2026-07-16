import { LeaveRequesterType, LeaveStatus, Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { normalizeDateOnly, parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  createLeaveSchema,
  listLeaveSchema,
  reviewLeaveSchema,
  type CreateLeaveInput,
  type ReviewLeaveInput,
} from "@/server/validators/leave.validator";

export async function listLeaveRequests(input?: {
  page?: number;
  pageSize?: number;
  status?: LeaveStatus;
  requesterType?: LeaveRequesterType;
  studentId?: string;
  staffProfileId?: string;
}) {
  const { user } = await requirePermission("leave.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listLeaveSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  if (user.role === Role.STUDENT) {
    if (!user.studentId) throw new Error("FORBIDDEN");
    params.studentId = user.studentId;
    params.requesterType = LeaveRequesterType.STUDENT;
  }

  const where = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.requesterType ? { requesterType: params.requesterType } : {}),
    ...(params.studentId
      ? {
          studentId: params.studentId,
          student: { schoolId },
        }
      : {}),
    ...(params.staffProfileId
      ? {
          staffProfileId: params.staffProfileId,
          staffProfile: { schoolId },
        }
      : {}),
    ...(!params.studentId && !params.staffProfileId
      ? {
          OR: [
            { student: { schoolId } },
            { staffProfile: { schoolId } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true } },
        staffProfile: { select: { id: true, fullName: true, employeeCode: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getLeaveRequest(leaveId: string) {
  const { user } = await requirePermission("leave.view");
  const schoolId = schoolIdFromUser(user);

  const leave = await prisma.leaveRequest.findFirst({
    where: {
      id: leaveId,
      OR: [{ student: { schoolId } }, { staffProfile: { schoolId } }],
    },
    include: {
      student: true,
      staffProfile: true,
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!leave) throw new Error("Leave request not found");

  if (
    user.role === Role.STUDENT &&
    (leave.requesterType !== LeaveRequesterType.STUDENT ||
      leave.studentId !== user.studentId)
  ) {
    throw new Error("FORBIDDEN");
  }

  return leave;
}

export async function createLeaveRequest(input: CreateLeaveInput) {
  const { user } = await requirePermission("leave.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createLeaveSchema, input);

  if (user.role === Role.STUDENT) {
    if (
      data.requesterType !== LeaveRequesterType.STUDENT ||
      data.studentId !== user.studentId
    ) {
      throw new Error("FORBIDDEN");
    }
  }

  if (data.requesterType === LeaveRequesterType.STUDENT && data.studentId) {
    const student = await prisma.student.findFirst({
      where: { id: data.studentId, schoolId },
    });
    if (!student) throw new Error("Student not found");
  }

  if (data.requesterType === LeaveRequesterType.STAFF && data.staffProfileId) {
    const staff = await prisma.staffProfile.findFirst({
      where: { id: data.staffProfileId, schoolId },
    });
    if (!staff) throw new Error("Staff member not found");

    if (user.role === Role.TEACHER && user.staffProfileId !== data.staffProfileId) {
      throw new Error("Teachers can only create leave for themselves");
    }
  }

  const fromDate = normalizeDateOnly(data.fromDate);
  const toDate = normalizeDateOnly(data.toDate);

  return prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.create({
      data: {
        requesterType: data.requesterType,
        studentId: data.studentId,
        staffProfileId: data.staffProfileId,
        fromDate,
        toDate,
        reason: data.reason,
        status: LeaveStatus.PENDING,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "leave",
        entityType: "LeaveRequest",
        entityId: leave.id,
        newValue: leave,
      },
      tx,
    );

    return leave;
  });
}

export async function reviewLeaveRequest(input: ReviewLeaveInput) {
  const { user } = await requirePermission("leave.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(reviewLeaveSchema, input);

  const existing = await getLeaveRequest(data.id);
  if (existing.status !== LeaveStatus.PENDING && data.status !== LeaveStatus.CANCELLED) {
    throw new Error("Leave request has already been reviewed");
  }

  if (
    user.role === Role.STUDENT &&
    data.status === LeaveStatus.CANCELLED &&
    existing.studentId === user.studentId
  ) {
    // Students can cancel their own pending leave
  } else if (user.role === Role.STUDENT) {
    throw new Error("FORBIDDEN");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id: data.id },
      data: {
        status: data.status,
        remarks: data.remarks,
        approvedById: user.id,
        reviewedAt: new Date(),
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "leave",
        entityType: "LeaveRequest",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );

    return updated;
  });
}

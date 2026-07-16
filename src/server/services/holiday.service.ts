import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { normalizeDateOnly, parsePagination, schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  createHolidaySchema,
  listHolidaysSchema,
  updateHolidaySchema,
  type CreateHolidayInput,
  type UpdateHolidayInput,
} from "@/server/validators/holiday.validator";

export async function listHolidays(input?: {
  page?: number;
  pageSize?: number;
  year?: number;
  month?: number;
}) {
  const { user } = await requirePermission("holiday.view");
  const schoolId = schoolIdFromUser(user);
  const params = parseOrThrow(listHolidaysSchema, input ?? {});
  const { skip, take, page, pageSize } = parsePagination(params.page, params.pageSize);

  const where = {
    schoolId,
    ...(params.year
      ? {
          date: {
            gte: new Date(Date.UTC(params.year, (params.month ?? 1) - 1, 1)),
            lte: new Date(
              Date.UTC(params.year, params.month ?? 12, params.month ? 0 : 31, 23, 59, 59),
            ),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.holiday.findMany({
      where,
      orderBy: { date: "asc" },
      skip,
      take,
    }),
    prisma.holiday.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getHoliday(holidayId: string) {
  const { user } = await requirePermission("holiday.view");
  const schoolId = schoolIdFromUser(user);

  const holiday = await prisma.holiday.findFirst({
    where: { id: holidayId, schoolId },
  });
  if (!holiday) throw new Error("Holiday not found");
  return holiday;
}

export async function createHoliday(input: CreateHolidayInput) {
  const { user } = await requirePermission("holiday.create");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(createHolidaySchema, input);
  const date = normalizeDateOnly(data.date);

  const dup = await prisma.holiday.findUnique({
    where: { schoolId_date: { schoolId, date } },
  });
  if (dup) throw new Error(`Holiday already exists on ${date.toISOString().slice(0, 10)}`);

  return prisma.$transaction(async (tx) => {
    const holiday = await tx.holiday.create({
      data: { schoolId, date, name: data.name, description: data.description, type: data.type },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "create",
        module: "holiday",
        entityType: "Holiday",
        entityId: holiday.id,
        newValue: holiday,
      },
      tx,
    );
    return holiday;
  });
}

export async function updateHoliday(input: UpdateHolidayInput) {
  const { user } = await requirePermission("holiday.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateHolidaySchema, input);

  const existing = await getHoliday(data.id);
  const date = data.date ? normalizeDateOnly(data.date) : undefined;

  if (date) {
    const dup = await prisma.holiday.findFirst({
      where: { schoolId, date, id: { not: data.id } },
    });
    if (dup) throw new Error(`Holiday already exists on ${date.toISOString().slice(0, 10)}`);
  }

  const { id, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.holiday.update({
      where: { id },
      data: { ...rest, ...(date ? { date } : {}) },
    });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "holiday",
        entityType: "Holiday",
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteHoliday(holidayId: string) {
  const { user } = await requirePermission("holiday.delete");
  const schoolId = schoolIdFromUser(user);
  const existing = await getHoliday(holidayId);

  return prisma.$transaction(async (tx) => {
    await tx.holiday.delete({ where: { id: holidayId } });
    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "delete",
        module: "holiday",
        entityType: "Holiday",
        entityId: holidayId,
        oldValue: existing,
      },
      tx,
    );
    return { success: true };
  });
}

export async function getHolidaysInRange(schoolId: string, from: Date, to: Date) {
  return prisma.holiday.findMany({
    where: {
      schoolId,
      date: { gte: normalizeDateOnly(from), lte: normalizeDateOnly(to) },
    },
    orderBy: { date: "asc" },
  });
}

export async function getHolidayDateSet(schoolId: string, from: Date, to: Date): Promise<Set<string>> {
  const holidays = await getHolidaysInRange(schoolId, from, to);
  return new Set(holidays.map((h) => normalizeDateOnly(h.date).toISOString().slice(0, 10)));
}

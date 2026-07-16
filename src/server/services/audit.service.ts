import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";

type AuditInput = {
  schoolId?: string | null;
  userId?: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(input: AuditInput, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  return client.auditLog.create({
    data: {
      schoolId: input.schoolId ?? undefined,
      userId: input.userId ?? undefined,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined,
    },
  });
}

export function requestMeta(headersList: Headers) {
  return {
    ipAddress:
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headersList.get("x-real-ip") ??
      null,
    userAgent: headersList.get("user-agent"),
  };
}

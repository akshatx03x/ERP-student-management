import { LeaveRequesterType, LeaveStatus } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema, paginationSchema } from "./common";

export const createLeaveSchema = z
  .object({
    requesterType: z.nativeEnum(LeaveRequesterType),
    studentId: idSchema.optional().nullable(),
    staffProfileId: idSchema.optional().nullable(),
    fromDate: dateSchema,
    toDate: dateSchema,
    reason: z.string().trim().min(1),
  })
  .refine(
    (d) =>
      (d.requesterType === LeaveRequesterType.STUDENT && d.studentId) ||
      (d.requesterType === LeaveRequesterType.STAFF && d.staffProfileId),
    { message: "Student or staff ID required based on requester type" },
  )
  .refine((d) => d.toDate >= d.fromDate, {
    message: "To date must be on or after from date",
    path: ["toDate"],
  });

export const reviewLeaveSchema = z.object({
  id: idSchema,
  status: z.enum([LeaveStatus.APPROVED, LeaveStatus.REJECTED, LeaveStatus.CANCELLED]),
  remarks: z.string().trim().optional().nullable(),
});

export const listLeaveSchema = paginationSchema.extend({
  status: z.nativeEnum(LeaveStatus).optional(),
  requesterType: z.nativeEnum(LeaveRequesterType).optional(),
  studentId: idSchema.optional(),
  staffProfileId: idSchema.optional(),
});

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;
export type ReviewLeaveInput = z.infer<typeof reviewLeaveSchema>;

"use server";

import { revalidatePath } from "next/cache";
import {
  listAdmissions,
  createAdmission,
  approveAdmission,
  rejectAdmission,
} from "@/server/services/admission.service";
import {
  markAttendance,
  listAttendanceForSection,
  getMonthlyAttendanceSummary,
} from "@/server/services/attendance.service";
import {
  listLeaveRequests,
  createLeaveRequest,
  reviewLeaveRequest,
} from "@/server/services/leave.service";
import {
  listHolidays,
  createHoliday,
  deleteHoliday,
} from "@/server/services/holiday.service";
import {
  getTimetable,
  createTimetableSlot,
  deleteTimetableSlot,
} from "@/server/services/timetable.service";
import type { CreateAdmissionInput, ReviewAdmissionInput } from "@/server/validators/admission.validator";
import type { MarkAttendanceInput, MonthlySummaryInput } from "@/server/validators/attendance.validator";
import type { CreateLeaveInput, ReviewLeaveInput } from "@/server/validators/leave.validator";
import type { CreateHolidayInput } from "@/server/validators/holiday.validator";
import type { CreateTimetableSlotInput, TimetableViewInput } from "@/server/validators/timetable.validator";

export async function listAdmissionsAction(input?: Parameters<typeof listAdmissions>[0]) {
  return listAdmissions(input);
}
export async function createAdmissionAction(input: CreateAdmissionInput) {
  const r = await createAdmission(input);
  revalidatePath("/admissions");
  return r;
}
export async function approveAdmissionAction(input: ReviewAdmissionInput) {
  const r = await approveAdmission(input);
  revalidatePath("/admissions");
  revalidatePath("/students");
  return r;
}
export async function rejectAdmissionAction(input: ReviewAdmissionInput) {
  const r = await rejectAdmission(input);
  revalidatePath("/admissions");
  return r;
}

export async function markAttendanceAction(input: MarkAttendanceInput) {
  const r = await markAttendance(input);
  revalidatePath("/attendance");
  return r;
}
export async function listAttendanceAction(input: Parameters<typeof listAttendanceForSection>[0]) {
  return listAttendanceForSection(input);
}
export async function monthlyAttendanceAction(input: MonthlySummaryInput) {
  return getMonthlyAttendanceSummary(input);
}

export async function listLeaveAction(input?: Parameters<typeof listLeaveRequests>[0]) {
  return listLeaveRequests(input);
}
export async function createLeaveAction(input: CreateLeaveInput) {
  const r = await createLeaveRequest(input);
  revalidatePath("/leave");
  return r;
}
export async function reviewLeaveAction(input: ReviewLeaveInput) {
  const r = await reviewLeaveRequest(input);
  revalidatePath("/leave");
  return r;
}

export async function listHolidaysAction(input?: Parameters<typeof listHolidays>[0]) {
  return listHolidays(input);
}
export async function createHolidayAction(input: CreateHolidayInput) {
  const r = await createHoliday(input);
  revalidatePath("/holidays");
  return r;
}
export async function deleteHolidayAction(id: string) {
  await deleteHoliday(id);
  revalidatePath("/holidays");
}

export async function getTimetableAction(input: TimetableViewInput) {
  return getTimetable(input);
}
export async function createTimetableSlotAction(input: CreateTimetableSlotInput) {
  const r = await createTimetableSlot(input);
  revalidatePath("/timetable");
  return r;
}
export async function deleteTimetableSlotAction(id: string) {
  await deleteTimetableSlot(id);
  revalidatePath("/timetable");
}

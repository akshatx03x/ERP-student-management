import { Prisma } from "@prisma/client";
import type { AppUser } from "@/server/auth/session";

export function requireSchoolId(schoolId: string | null | undefined): string {
  return schoolId ?? "";
}

export function schoolIdFromUser(user: AppUser): string {
  return user.schoolId ?? "";
}

export function parsePagination(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1);
  const size = Math.min(100, Math.max(1, pageSize ?? 20));
  return { skip: (p - 1) * size, take: size, page: p, pageSize: size };
}

export function toDecimal(value: number | string | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function decimalToNumber(value: Prisma.Decimal | number | string): number {
  return Number(value);
}

export function sumDecimals(values: Array<Prisma.Decimal | number | string>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (acc, v) => acc.add(toDecimal(v)),
    new Prisma.Decimal(0),
  );
}

export function buildFullName(
  first: string,
  middle?: string | null,
  last?: string | null,
): string {
  return [first, middle, last].filter(Boolean).join(" ").trim();
}

export function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function normalizeDateOnly(input: Date | string): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return startOfDayUTC(d);
}

export function eachDayInRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const current = normalizeDateOnly(from);
  const end = normalizeDateOnly(to);
  while (current <= end) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export async function generateSequentialNo(
  prefix: string,
  year: number,
  existingCount: number,
  pad = 4,
): Promise<string> {
  const seq = String(existingCount + 1).padStart(pad, "0");
  return `${prefix}-${year}-${seq}`;
}

export async function getNextSequenceValue(
  tx: Prisma.TransactionClient,
  counterId: string,
): Promise<number> {
  const counter = await tx.systemCounter.upsert({
    where: { id: counterId },
    create: { id: counterId, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}


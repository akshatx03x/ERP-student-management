import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function studentDobPassword(dob: Date, format = "DDMMYYYY") {
  const day = String(dob.getUTCDate()).padStart(2, "0");
  const month = String(dob.getUTCMonth() + 1).padStart(2, "0");
  const year = String(dob.getUTCFullYear());
  if (format === "YYYYMMDD") return `${year}${month}${day}`;
  if (format === "DD-MM-YYYY") return `${day}-${month}-${year}`;
  return `${day}${month}${year}`;
}

export function staffSyntheticEmail(employeeCode: string) {
  return `${employeeCode.toLowerCase().trim()}@staff.vidhyanjali.local`;
}

export function studentSyntheticEmail(admissionNo: string) {
  return `${admissionNo.toLowerCase().trim()}@student.vidhyanjali.local`;
}

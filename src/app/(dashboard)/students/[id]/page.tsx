import { notFound } from "next/navigation";
import { getStudent } from "@/server/services/student.service";
import { getStudentFeeLedger, getStudentPortalFees } from "@/server/services/fee.service";
import { requirePermission, resolveEffectivePermissions } from "@/server/permissions/guard";
import { StudentFeePageClient } from "./student-fee-page-client";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { user } = await requirePermission("student.view");
  const isStudentSelf = user.role === "STUDENT" && user.studentId === id;
  const perms = await resolveEffectivePermissions(user.id, user.role);
  const canDelete = perms.has("student.delete") && !isStudentSelf;

  const [studentResult, ledgerResult] = await Promise.allSettled([
    getStudent(id),
    getStudentFeeLedger(id),
    ...(isStudentSelf ? [getStudentPortalFees()] : []),
  ]);

  if (studentResult.status === "rejected") notFound();

  const student = studentResult.value;
  const ledger = ledgerResult.status === "fulfilled" ? ledgerResult.value : null;

  const family = student.family;
  const addressParts = [
    family.addressLine1,
    family.addressLine2,
    family.city,
    family.state,
    family.pincode,
  ].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "—";

  const siblings = student.siblings.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    admissionNo: s.admissionNo,
    gender: s.gender,
    enrollments: s.enrollments,
  }));

  const currentEnrollment = student.enrollments[0] ?? null;

  // ── Month-wise fee table aggregation ──
  const ALL_MONTHS = ["APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC","JAN","FEB","MAR"] as const;
  type MonthKey = typeof ALL_MONTHS[number];

  const monthFromDueDate = (d: Date | string | null): MonthKey => {
    if (!d) return "APR";
    const date = typeof d === "string" ? new Date(d) : d;
    const jsMonth = date.getMonth(); // 0=Jan … 11=Dec
    // Academic year APR(0)→MAR(11)
    const acaIdx = (jsMonth - 3 + 12) % 12;
    return ALL_MONTHS[acaIdx];
  };

  type FeeHeadRow = {
    feeHead: string;
    months: Record<MonthKey, { amount: number; paid: number; remaining: number }>;
    total: number;
    totalPaid: number;
    totalRemaining: number;
  };

  const feeHeadMap: Record<string, FeeHeadRow> = {};
  const lines = ledger?.lines ?? [];

  let totalDiscount = 0;
  let totalLateFine = 0;

  for (const line of lines) {
    const head = line.feeHead?.name ?? "Other";
    const mk = monthFromDueDate(line.dueDate);

    totalDiscount += line.discountAmount ?? 0;
    totalLateFine += line.finalFine ?? 0;

    if (!feeHeadMap[head]) {
      feeHeadMap[head] = {
        feeHead: head,
        months: {} as Record<MonthKey, { amount: number; paid: number; remaining: number }>,
        total: 0,
        totalPaid: 0,
        totalRemaining: 0,
      };
    }
    const row = feeHeadMap[head];
    if (!row.months[mk]) {
      row.months[mk] = { amount: 0, paid: 0, remaining: 0 };
    }
    row.months[mk].amount += line.amount;
    row.months[mk].paid += line.paidAmount;
    row.months[mk].remaining += line.remaining;
    row.total += line.amount;
    row.totalPaid += line.paidAmount;
    row.totalRemaining += line.remaining;
  }

  const feeHeadRows = Object.values(feeHeadMap);

  // ── Payment history ──
  const paymentHistory = (ledger?.paymentHistory ?? []).map((p) => ({
    id: p.id,
    receiptNo: p.receiptNo,
    paidAt: formatDate(p.paidAt),
    method: p.method,
    allocatedToStudent: formatCurrency(p.allocatedToStudent),
    recordedBy: p.recordedBy,
    lines: p.lines,
  }));

  const monthCollectors = paymentHistory.reduce((collectors, payment) => {
    if (!payment.recordedBy) return collectors;

    for (const line of payment.lines) {
      const month = monthFromDueDate(line.dueDate);
      const names = collectors[month] ?? [];
      if (!names.includes(payment.recordedBy)) names.push(payment.recordedBy);
      collectors[month] = names;
    }
    return collectors;
  }, {} as Partial<Record<MonthKey, string[]>>);

  // ── Pending dues: lines with remaining > 0 ──
  const pendingDues = lines
    .filter((l) => l.remaining > 0)
    .map((l) => ({
      id: l.id,
      feeHead: l.feeHead?.name ?? "Other",
      month: monthFromDueDate(l.dueDate),
      pending: l.remaining,
      fine: l.finalFine ?? 0,
    }));

  // ── Totals ──
  const totalFee = ledger?.totalFee ?? 0;
  const totalPaid = ledger?.paid ?? 0;
  const totalRemaining = ledger?.remaining ?? 0;

  return (
    <StudentFeePageClient
      student={{
        id: student.id,
        fullName: student.fullName,
        admissionNo: student.admissionNo,
        gender: student.gender,
        bloodGroup: student.bloodGroup,
        dateOfBirth: formatDate(student.dateOfBirth),
        admissionDate: student.admissionDate ? formatDate(student.admissionDate) : "—",
        status: student.status,
        photoUrl: student.photoUrl,
        apaarId: student.apaarId,
        penId: student.penId,
        srNo: student.srNo,
      }}
      family={{
        fatherName: family.fatherName,
        primaryPhone: family.primaryPhone,
      }}
      currentEnrollment={currentEnrollment ? {
        className: currentEnrollment.class.name,
        sectionName: currentEnrollment.section.name,
        sessionName: currentEnrollment.session.name,
        rollNo: currentEnrollment.rollNo,
      } : null}
      siblings={siblings}
      enrollments={student.enrollments.map((e) => ({
        id: e.id,
        sessionName: e.session.name,
        className: e.class.name,
        sectionName: e.section.name,
        rollNo: e.rollNo,
        status: e.status,
      }))}
      paymentHistory={paymentHistory}
      monthCollectors={monthCollectors}
      pendingDues={pendingDues}
      feeHeadRows={feeHeadRows}
      allMonths={ALL_MONTHS as unknown as string[]}
      totalFee={formatCurrency(totalFee)}
      totalPaid={formatCurrency(totalPaid)}
      totalRemaining={formatCurrency(totalRemaining)}
      totalDiscount={formatCurrency(totalDiscount)}
      totalLateFine={formatCurrency(totalLateFine)}
      isStudentSelf={isStudentSelf}
      canDelete={canDelete}
      userRole={user.role}
    />
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getReceiptAction } from "@/server/actions/fee.actions";
import {
  Edit3, Eye, Users,
  Receipt, Tag, RotateCcw, AlertCircle, Printer, X
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EnrollmentRow = {
  id: string;
  sessionName: string;
  className: string;
  sectionName: string;
  rollNo: string | null;
  status: string;
};

type PaymentRow = {
  id: string;
  receiptNo: string;
  paidAt: string;
  method: string;
  allocatedToStudent: string;
  recordedBy: string | null;
  lines: Array<{ feeHead: string; amount: number; dueDate: Date | string | null }>;
};

type PendingDue = {
  id: string;
  feeHead: string;
  month: string;
  pending: number;
  fine: number;
};

type FeeHeadRow = {
  feeHead: string;
  months: Record<string, { amount: number; paid: number; remaining: number }>;
  total: number;
  totalPaid: number;
  totalRemaining: number;
};

type Sibling = {
  id: string;
  fullName: string;
  admissionNo: string;
  gender: string | null;
  enrollments: Array<{ class: { name: string }; section: { name: string } }>;
};

type ActivityTab = "transactions" | "discounts" | "refunds" | "pending";

// ─── Main Component ───────────────────────────────────────────────────────────

export function StudentFeePageClient({
  student,
  family,
  currentEnrollment,
  siblings,
  enrollments,
  paymentHistory,
  monthCollectors,
  pendingDues,
  feeHeadRows,
  allMonths,
  totalFee,
  totalPaid,
  totalRemaining,
  totalDiscount,
  totalLateFine,
  isStudentSelf,
  canDelete,
  userRole,
}: {
  student: {
    id: string;
    fullName: string;
    admissionNo: string;
    gender: string | null;
    bloodGroup: string | null;
    dateOfBirth: string;
    admissionDate: string;
    status: string;
    photoUrl: string | null | undefined;
    apaarId: string | null | undefined;
    penId: string | null | undefined;
    srNo: string | null | undefined;
  };
  family: {
    fatherName: string | null;
    primaryPhone: string | null;
  };
  currentEnrollment: {
    className: string;
    sectionName: string;
    sessionName: string;
    rollNo: string | null;
  } | null;
  siblings: Sibling[];
  enrollments: EnrollmentRow[];
  paymentHistory: PaymentRow[];
  monthCollectors: Partial<Record<string, string[]>>;
  pendingDues: PendingDue[];
  feeHeadRows: FeeHeadRow[];
  allMonths: string[];
  totalFee: string;
  totalPaid: string;
  totalRemaining: string;
  totalDiscount: string;
  totalLateFine: string;
  isStudentSelf: boolean;
  canDelete: boolean;
  userRole: string;
}) {
  const [activityTab, setActivityTab] = useState<ActivityTab>("transactions");
  const [receiptSnapshot, setReceiptSnapshot] = useState<any | null>(null);
  const [printLoading, setPrintLoading] = useState<string | null>(null);

  async function handlePrint(paymentId: string) {
    setPrintLoading(paymentId);
    try {
      const r = await getReceiptAction(paymentId);
      setReceiptSnapshot(r.snapshot);
    } finally {
      setPrintLoading(null);
    }
  }

  const initials = student.fullName
    .split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  const avatarBg =
    student.gender === "MALE"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : student.gender === "FEMALE"
        ? "bg-pink-50 text-pink-700 border-pink-200"
        : "bg-stone-100 text-stone-600 border-stone-200";

  const tabs: { key: ActivityTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "transactions", label: "Transactions", icon: <Receipt className="w-3 h-3" />, count: paymentHistory.length },
  ];

  return (
    <div className="space-y-4 text-sm">

      {/* ── TOPBAR ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/students" className="text-xs text-stone-500 hover:text-stone-700 font-medium">
            Students
          </Link>
          <span className="text-stone-300 text-xs">›</span>
          <span className="text-xs font-bold text-stone-900">{student.fullName}</span>
          <Badge
            variant={student.status === "ACTIVE" ? "success" : "secondary"}
            className="text-[9px] h-5 px-2 font-bold rounded ml-1"
          >
            {student.status}
          </Badge>
        </div>
        {!isStudentSelf && (
          <div className="flex items-center gap-2">
            <Link
              href={`/students/${student.id}/details`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors shadow-xs"
            >
              <Eye className="w-3.5 h-3.5" /> View More
            </Link>
            <Link
              href={`/students/${student.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-semibold hover:bg-stone-800 transition-colors shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit Profile
            </Link>
          </div>
        )}
      </div>

      {/* ── UPPER: 2-COL GRID ── */}
      <div className="grid lg:grid-cols-5 gap-4 items-stretch">

        {/* ── LEFT: Student Information + Siblings (2 cols) ── */}
        <div className="lg:col-span-2 space-y-3">

          {/* Student Info Card */}
          <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5">
              <span className="text-[11px] font-black text-stone-600 uppercase tracking-wider">Student Information</span>
            </div>
            <div className="p-4 space-y-4">

              {/* Photo + Name */}
              <div className="flex gap-4 items-center">
                <div className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl font-extrabold overflow-hidden shadow-sm ${avatarBg}`}>
                  {student.photoUrl ? (
                    <img src={student.photoUrl} alt={student.fullName} className="h-full w-full object-cover" />
                  ) : initials}
                </div>
                <div className="min-w-0">
                  <h2 className="font-black text-stone-900 text-base leading-tight">{student.fullName}</h2>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Chip color="amber">Adm. No: {student.admissionNo}</Chip>
                    {currentEnrollment?.rollNo && <Chip color="blue">Roll {currentEnrollment.rollNo}</Chip>}
                  </div>
                </div>
              </div>

              {/* Details grid */}
              <div className="space-y-0.5 mt-1">
                <InfoRow label="Class" value={currentEnrollment ? `${currentEnrollment.className} – ${currentEnrollment.sectionName}` : "—"} />
                <InfoRow label="Session" value={currentEnrollment?.sessionName} />
                <InfoRow label="Gender" value={student.gender} />
                <InfoRow label="Date of Birth" value={student.dateOfBirth} />
                <InfoRow label="Blood Group" value={student.bloodGroup} />
                <InfoRow label="Admission Date" value={student.admissionDate} />
                <InfoRow label="Mobile No." value={family.primaryPhone} />
                <InfoRow label="APAAR ID" value={student.apaarId} />
                <InfoRow label="PEN ID" value={student.penId} />
                <InfoRow label="SR Number" value={student.srNo} />
              </div>
            </div>
          </div>

        </div>

        {/* ── RIGHT: Quick Activity Tabs (3 cols) ── */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden flex flex-col flex-1">
            <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5">
              <span className="text-[11px] font-black text-stone-600 uppercase tracking-wider">Quick Activity</span>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-stone-100 bg-white px-2 gap-0.5 pt-1.5">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActivityTab(t.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-t-lg border-b-2 transition-all ${
                    activityTab === t.key
                      ? "border-stone-900 text-stone-900 bg-stone-50"
                      : "border-transparent text-stone-400 hover:text-stone-600 hover:bg-stone-50/50"
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${activityTab === t.key ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-600"}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content — fills remaining card height */}
            <div className="p-4 flex-1 overflow-y-auto
              [&::-webkit-scrollbar]:w-1.5
              [&::-webkit-scrollbar-track]:bg-stone-50
              [&::-webkit-scrollbar-thumb]:bg-stone-300
              [&::-webkit-scrollbar-thumb]:rounded-full">

              {/* TRANSACTIONS */}
              {activityTab === "transactions" && (
                paymentHistory.length === 0 ? (
                  <EmptyState label="No payment transactions recorded." />
                ) : (
                  <ActivityTable
                    headers={["Rec No.", "Date", "Amount", "Mode", ...(!isStudentSelf ? ["Collected By"] : []), ""]}
                    rows={paymentHistory.map((p) => [
                      <span key="r" className="font-mono font-bold text-stone-700">{p.receiptNo}</span>,
                      <span key="d" className="text-stone-500">{p.paidAt}</span>,
                      <span key="a" className="font-bold text-stone-900">{p.allocatedToStudent}</span>,
                      <span key="m" className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">{p.method}</span>,
                      ...(!isStudentSelf ? [<span key="collector" className="text-stone-500 truncate" title={p.recordedBy ?? undefined}>{p.recordedBy ?? "—"}</span>] : []),
                      <button
                        key="print"
                        onClick={() => handlePrint(p.id)}
                        disabled={printLoading === p.id}
                        title="Print receipt"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors disabled:opacity-40"
                      >
                        {printLoading === p.id
                          ? <span className="w-3 h-3 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                          : <Printer className="w-3.5 h-3.5" />}
                      </button>,
                    ])}
                  />
                )
              )}
            </div>
          </div>

          {/* Siblings — below Quick Activity on right */}
          <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-stone-500" />
              <span className="text-[11px] font-black text-stone-600 uppercase tracking-wider">Linked Siblings</span>
              {siblings.length > 0 && (
                <span className="ml-auto bg-stone-200 text-stone-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">{siblings.length}</span>
              )}
            </div>
            <div className="p-3">
              {siblings.length === 0 ? (
                <p className="text-center text-xs text-stone-400 font-medium py-3">No linked siblings.</p>
              ) : (
                <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-0.5
                  [&::-webkit-scrollbar]:w-1.5
                  [&::-webkit-scrollbar-track]:bg-stone-50
                  [&::-webkit-scrollbar-thumb]:bg-stone-300
                  [&::-webkit-scrollbar-thumb]:rounded-full">
                  {siblings.map((s) => {
                    const enr = s.enrollments?.[0];
                    return (
                      <Link
                        key={s.id}
                        href={`/students/${s.id}`}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-all"
                      >
                        <div>
                          <span className="font-bold text-stone-800 text-xs block">{s.fullName}</span>
                          <span className="text-[10px] text-stone-500">{s.admissionNo}</span>
                        </div>
                        <span className="text-[10px] text-stone-500 font-semibold bg-stone-100 px-2 py-0.5 rounded">
                          {enr ? `${enr.class.name}-${enr.section.name}` : "—"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── RECEIPT PREVIEW MODAL ── */}
      {receiptSnapshot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setReceiptSnapshot(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-4">
              <h3 className="text-sm font-black text-stone-900">Fee Receipt</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-semibold hover:bg-stone-800 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button onClick={() => setReceiptSnapshot(null)} className="text-stone-400 hover:text-stone-700 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="border border-stone-200 rounded-xl p-5 text-xs space-y-4">
              <div className="text-center border-b border-stone-100 pb-3">
                <h2 className="text-base font-black uppercase">{receiptSnapshot.branding?.schoolName || "School"}</h2>
                {receiptSnapshot.branding?.address && <p className="text-stone-500 text-[11px] mt-0.5">{receiptSnapshot.branding.address}</p>}
                <div className="mt-2 inline-block bg-stone-100 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase">Fee Receipt</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-700">
                <p><span className="font-bold">Receipt No:</span> {receiptSnapshot.receiptNo}</p>
                <p className="text-right"><span className="font-bold">Date:</span> {formatDate(receiptSnapshot.paidAt)}</p>
                <p><span className="font-bold">Mode:</span> {receiptSnapshot.method}</p>
              </div>
              <table className="w-full border-collapse border-y border-stone-200">
                <thead><tr className="bg-stone-100 text-[10px] font-bold uppercase text-stone-700">
                  <th className="py-2 px-2">Student</th>
                  <th className="py-2 px-2">Fee Head</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {(receiptSnapshot.allocations || []).map((a: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-2 px-2 font-bold">{a.studentName}</td>
                      <td className="py-2 px-2 text-stone-600">{a.feeHead}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold">{formatCurrency(a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] text-stone-500">Total Paid</span>
                <span className="font-black text-stone-900 text-sm">{formatCurrency(receiptSnapshot.amount)}</span>
              </div>
              {receiptSnapshot.branding?.receiptFooter && (
                <p className="text-center text-[10px] text-stone-400 border-t border-stone-100 pt-2">{receiptSnapshot.branding.receiptFooter}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM 1: FEE STATUS TABLE (unchanged design) ── */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
        <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5 flex items-center gap-3">
          <span className="text-[11px] font-black text-stone-600 uppercase tracking-wider">School Fee Status</span> 
        </div>

        {feeHeadRows.length === 0 ? (
          <div className="px-6 py-8 text-center text-xs text-stone-400 font-semibold">
            No fee records found for the current session.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-stone-100 border-b border-stone-200">
                    <th className="py-2 px-3 font-black text-stone-700 whitespace-nowrap min-w-[110px]">Fee Head</th>
                    {allMonths.map((m) => (
                      <th key={m} className="py-2 px-2 text-center font-black text-stone-600 min-w-[52px]">{m}</th>
                    ))}
                    <th className="py-2 px-3 text-right font-black text-stone-700 whitespace-nowrap bg-stone-200">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {/* Total Fee Row */}
                  <tr className="bg-stone-50">
                    <td className="py-2 px-3 font-bold text-stone-700">Total Fee</td>
                    {allMonths.map((m) => {
                      const t = feeHeadRows.reduce((s, r) => s + (r.months[m]?.amount ?? 0), 0);
                      return <td key={m} className="py-2 px-2 text-center text-stone-600 font-medium">{t > 0 ? t.toLocaleString() : "—"}</td>;
                    })}
                    <td className="py-2 px-3 text-right font-black text-stone-900 bg-yellow-50">
                      {feeHeadRows.reduce((s, r) => s + r.total, 0).toLocaleString()}
                    </td>
                  </tr>

                  {/* Per fee head */}
                  {feeHeadRows.map((row) => (
                    <tr key={row.feeHead}>
                      <td className="py-2 px-3 font-medium text-stone-700">{row.feeHead}</td>
                      {allMonths.map((m) => {
                        const cell = row.months[m];
                        return (
                          <td key={m} className="py-2 px-2 text-center">
                            {cell ? (
                              <span className={cell.remaining > 0 ? "text-rose-600 font-bold" : "text-emerald-700 font-bold"}>
                                {cell.remaining > 0 ? cell.remaining.toLocaleString() : "Paid"}
                              </span>
                            ) : <span className="text-stone-300">—</span>}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-right bg-stone-50">
                        <span className={row.totalRemaining > 0 ? "font-black text-rose-700" : "font-black text-emerald-700"}>
                          {row.totalRemaining > 0 ? row.totalRemaining.toLocaleString() : "Paid"}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Paid Fee Row */}
                  <tr className="bg-emerald-50/40">
                    <td className="py-2 px-3 font-bold text-emerald-700">Paid Fee</td>
                    {allMonths.map((m) => {
                      const p = feeHeadRows.reduce((s, r) => s + (r.months[m]?.paid ?? 0), 0);
                      return <td key={m} className="py-2 px-2 text-center text-emerald-700 font-medium">{p > 0 ? p.toLocaleString() : "—"}</td>;
                    })}
                    <td className="py-2 px-3 text-right font-black text-emerald-700 bg-emerald-100">
                      {feeHeadRows.reduce((s, r) => s + r.totalPaid, 0).toLocaleString()}
                    </td>
                  </tr>

                  {/* Internal tracking only — never included in the printed receipt. */}
                  {!isStudentSelf && (
                    <tr className="bg-indigo-50/30">
                      <td className="py-2 px-3 font-bold text-indigo-700">Collected By</td>
                      {allMonths.map((m) => {
                        const collectors = monthCollectors[m] ?? [];
                        return (
                          <td key={m} className="py-2 px-2 text-center text-[10px] font-semibold text-indigo-700" title={collectors.join(", ") || undefined}>
                            {collectors.length > 0 ? collectors.join(", ") : "—"}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-right bg-indigo-100 text-[10px] font-semibold text-indigo-700">Internal</td>
                    </tr>
                  )}

                  {/* Balance Row */}
                  <tr className="bg-rose-50/40">
                    <td className="py-2 px-3 font-bold text-rose-700">Balance</td>
                    {allMonths.map((m) => {
                      const rem = feeHeadRows.reduce((s, r) => s + (r.months[m]?.remaining ?? 0), 0);
                      const amt = feeHeadRows.reduce((s, r) => s + (r.months[m]?.amount ?? 0), 0);
                      return (
                        <td key={m} className="py-2 px-2 text-center">
                          {amt === 0 ? <span className="text-stone-300">—</span>
                            : rem === 0 ? <span className="text-emerald-700 font-bold">Paid</span>
                            : <span className="text-rose-600 font-black">{rem.toLocaleString()}</span>}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right font-black text-rose-700 bg-rose-100">
                      {feeHeadRows.reduce((s, r) => s + r.totalRemaining, 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Financial Summary Strip */}
            <div className="border-t border-stone-200 bg-stone-50 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <SummaryChip label="Total Fee" value={totalFee} color="stone" />
                <div className="text-stone-300 text-xs">|</div>
                <SummaryChip label="Paid" value={totalPaid} color="emerald" />
                <div className="text-stone-300 text-xs">|</div>
                <SummaryChip label="Discount" value={totalDiscount} color="blue" />
                <div className="text-stone-300 text-xs">|</div>
                <SummaryChip label="Late Fine" value={totalLateFine} color="orange" />
                <div className="text-stone-300 text-xs">|</div>
                <SummaryChip label="Pending" value={totalRemaining} color="rose" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── BOTTOM 2: ACADEMIC LIFECYCLE ── */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
        <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5">
          <span className="text-[11px] font-black text-stone-600 uppercase tracking-wider">Academic Lifecycle</span>
        </div>
        <div className="p-4">
          {enrollments.length === 0 ? (
            <p className="text-xs text-stone-400 font-semibold text-center py-4">No enrollment history recorded.</p>
          ) : (
            <div className="max-h-[200px] overflow-y-auto pr-1">
              <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
                {[...enrollments].reverse().map((e, index, arr) => {
                  const isLatest = index === arr.length - 1;
                  return (
                    <div key={e.id} className="relative flex items-start gap-3">
                      <div
                        className={`absolute -left-6 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                          isLatest && e.status === "ACTIVE"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-stone-300 bg-white text-stone-500"
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 rounded-xl border border-stone-200 bg-white p-3 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-black text-stone-900 text-xs">{e.sessionName}</span>
                          <Badge
                            variant={
                              e.status === "ACTIVE" ? "success"
                              : e.status === "PROMOTED" ? "secondary"
                              : e.status === "RETAINED" ? "warning"
                              : "outline"
                            }
                            className="text-[9px] h-5 px-2 font-bold rounded"
                          >
                            {e.status === "ACTIVE" ? "ACTIVE (Current)" : e.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[11px] text-stone-500">
                          <span>Class: <strong className="text-stone-800">{e.className}-{e.sectionName}</strong></span>
                          <span>Roll No: <strong className="text-stone-800">{e.rollNo || "—"}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-stone-50 last:border-0">
      <span className="text-xs text-stone-400 font-medium w-[45%] shrink-0">{label}</span>
      <span className="text-xs font-bold text-stone-800 text-right leading-snug">{value || "—"}</span>
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: "amber" | "blue" | "stone" }) {
  const cls = {
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    stone: "bg-stone-100 text-stone-700 border-stone-200",
  }[color];
  return (
    <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${cls}`}>
      {children}
    </span>
  );
}

function SummaryChip({
  label, value, color,
}: {
  label: string;
  value: string;
  color: "stone" | "emerald" | "blue" | "orange" | "rose";
}) {
  const text = {
    stone: "text-stone-700",
    emerald: "text-emerald-700",
    blue: "text-blue-700",
    orange: "text-orange-600",
    rose: "text-rose-700",
  }[color];
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-stone-500 font-medium">{label}</span>
      <span className={`text-xs font-black ${text}`}>{value}</span>
    </div>
  );
}

function EmptyState({ label, success }: { label: string; success?: boolean }) {
  return (
    <div className={`flex items-center justify-center py-10 text-center`}>
      <div>
        <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full ${success ? "bg-emerald-50" : "bg-stone-50"}`}>
          {success
            ? <span className="text-lg">✓</span>
            : <span className="text-lg text-stone-400">—</span>}
        </div>
        <p className={`text-xs font-semibold ${success ? "text-emerald-600" : "text-stone-400"}`}>{label}</p>
      </div>
    </div>
  );
}

function ActivityTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200">
      <table className="w-full text-xs text-left">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr>
            {headers.map((h) => (
              <th key={h} className="py-2 px-3 font-black uppercase text-[9px] text-stone-500 tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-stone-50/50 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="py-2 px-3">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

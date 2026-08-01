"use client";

import { useState, useTransition, useMemo, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Printer,
  Download,
  Search,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  BookOpen,
} from "lucide-react";
import { getClassWiseFeeStatusReportAction } from "@/server/actions/financial-reports.actions";
import { toast } from "sonner";
import Link from "next/link";

interface FeeDetail {
  id: string;
  month: string;
  feeHeadName: string;
  amount: number;
  discount: number;
  fine: number;
  paid: number;
  pending: number;
  status: string;
}

interface StudentRow {
  studentId: string;
  studentName: string;
  admissionNo: string;
  fatherName: string;
  className: string;
  sectionName: string;
  expectedFee: number;
  paid: number;
  discount: number;
  lateFine: number;
  finalPayable: number;
  pending: number;
  lastPaymentDate: Date | string | null;
  receiptCount: number;
  feeDetails: FeeDetail[];
  paymentStatus: string;
}

interface MetaData {
  sessions: { id: string; name: string; isCurrent: boolean }[];
  classes: {
    id: string;
    name: string;
    sections: { id: string; name: string }[];
  }[];
  feeHeads: { id: string; name: string }[];
  activeSessionId: string;
}

export function ClassWiseStatusClient({ metaData }: { metaData: MetaData }) {
  const [isPending, startTransition] = useTransition();

  // Loading Step state
  const [sessionId, setSessionId] = useState(metaData.activeSessionId);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  // Table Data & Filters state
  const [reportData, setReportData] = useState<{ items: StudentRow[]; total: number } | null>(null);
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [feeHeadId, setFeeHeadId] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Accordion row expansion
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});

  // Export Dialog UI state
  const [showExportModal, setShowExportModal] = useState(false);

  const toggleStudent = (id: string) => {
    setExpandedStudents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFetch = (customPage?: number) => {
    if (!classId) {
      toast.error("Please select a Class first");
      return;
    }

    const currentPage = customPage !== undefined ? customPage : page;

    startTransition(async () => {
      try {
        const res = await getClassWiseFeeStatusReportAction({
          sessionId,
          classId,
          sectionId: sectionId || undefined,
          month: month || undefined,
          status: status || undefined,
          feeHeadId: feeHeadId || undefined,
          pendingOnly: pendingOnly || undefined,
          search: search || undefined,
          page: currentPage,
          pageSize,
        });
        setReportData(res as any);
      } catch (err: any) {
        toast.error("Failed to load records: " + err.message);
      }
    });
  };

  const selectedClassSections = useMemo(() => {
    if (!classId) return [];
    const cls = metaData.classes.find((c) => c.id === classId);
    return cls ? cls.sections : [];
  }, [classId, metaData.classes]);

  const totalPages = reportData ? Math.ceil(reportData.total / pageSize) : 0;

  const triggerExport = (mode: string) => {
    setShowExportModal(false);
    toast.success(`Exporting as ${mode}...`);
    // Operational export implementation
    const headers = "Admission No,Student Name,Father Name,Class,Section,Expected Fee,Paid,Discount,Fine,Final Payable,Pending,Status\n";
    
    let rowsToExport = reportData?.items || [];
    if (mode === "CSV_PENDING") {
      rowsToExport = rowsToExport.filter(r => r.pending > 0);
    }

    const body = rowsToExport
      .map(
        (r) =>
          `"${r.admissionNo}","${r.studentName}","${r.fatherName}","${r.className}","${r.sectionName}",${r.expectedFee},${r.paid},${r.discount},${r.lateFine},${r.finalPayable},${r.pending},"${r.paymentStatus}"`
      )
      .join("\n");

    const blob = new Blob([headers + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fee_status_${classId}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* ── STEP FILTER HEADER (STICKY) ── */}
      <div className="sticky top-0 z-30 bg-white border border-stone-200 p-4.5 rounded-xl space-y-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Step 1: Academic Session */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-stone-500">1. Academic Session</span>
            <Select
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setReportData(null);
              }}
              className="bg-white border-stone-300 text-stone-900 h-9 w-44 rounded-lg"
            >
              {metaData.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isCurrent ? "(Current)" : ""}
                </option>
              ))}
            </Select>
          </div>

          {/* Step 2: Class */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-stone-500">2. Select Class</span>
            <Select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSectionId("");
                setReportData(null);
              }}
              className="bg-white border-stone-300 text-stone-900 h-9 w-44 rounded-lg"
            >
              <option value="">Choose Class...</option>
              {metaData.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Step 3: Section (loads after Class is selected) */}
          {classId && (
            <div className="flex flex-col gap-1 animate-fade-in">
              <span className="text-[10px] uppercase font-bold text-stone-500">3. Section</span>
              <Select
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setReportData(null);
                }}
                className="bg-white border-stone-300 text-stone-900 h-9 w-36 rounded-lg"
              >
                <option value="">All Sections</option>
                {selectedClassSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    Section {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Step 4: View Status Button */}
          <div className="flex items-end h-full pt-4">
            <Button
              disabled={!classId || isPending}
              onClick={() => {
                setPage(1);
                handleFetch(1);
              }}
              className="bg-stone-900 hover:bg-stone-850 text-white font-extrabold h-9 px-5 rounded-lg transition-all"
            >
              View Fee Status
            </Button>
          </div>
        </div>
      </div>

      {/* ── CONDITIONAL TABLE & FILTERS LOAD ── */}
      {!reportData ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-16 text-center text-stone-500 shadow-sm">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30 text-stone-400" />
          <h3 className="text-sm font-black text-stone-800">Select Session & Class to view fee status</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            Fee status records are loaded per class to maintain high operational speed.
          </p>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          {/* Operational Filter & search row */}
          <div className="bg-white border border-stone-200 p-4 rounded-xl flex flex-wrap items-center gap-3 text-xs print:hidden shadow-sm">
            <div className="relative w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-405" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student, father or phone..."
                className="pl-9 bg-white border-stone-300 text-stone-900 h-9 rounded-lg"
              />
              
              {/* Search Recommendations / Auto-suggestions dropdown */}
              {search.trim().length >= 2 && reportData && (
                <div className="absolute left-0 right-0 top-10 z-50 bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-stone-100">
                  {reportData.items
                    .filter((item) =>
                      `${item.studentName} ${item.admissionNo} ${item.fatherName}`
                        .toLowerCase()
                        .includes(search.toLowerCase())
                    )
                    .slice(0, 5)
                    .map((item) => (
                      <button
                        key={item.studentId}
                        type="button"
                        onClick={() => {
                          setSearch(item.studentName);
                          // Expand and view detail of selected student recommendation
                          setExpandedStudents(prev => ({ ...prev, [item.studentId]: true }));
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-stone-50 text-[11px] text-stone-700 flex justify-between items-center transition-colors"
                      >
                        <span className="font-semibold text-stone-900">{item.studentName}</span>
                        <span className="font-mono text-stone-500 text-[10px]">Adm: {item.admissionNo}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-white border-stone-300 text-stone-900 h-9 w-36 rounded-lg"
            >
              <option value="">All Months</option>
              {[
                "APRIL",
                "MAY",
                "JUNE",
                "JULY",
                "AUGUST",
                "SEPTEMBER",
                "OCTOBER",
                "NOVEMBER",
                "DECEMBER",
                "JANUARY",
                "FEBRUARY",
                "MARCH",
              ].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>

            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-white border-stone-300 text-stone-900 h-9 w-36 rounded-lg"
            >
              <option value="">All Statuses</option>
              <option value="PAID">PAID</option>
              <option value="PARTIAL">PARTIAL</option>
              <option value="PENDING">PENDING</option>
            </Select>

            <label className="flex items-center gap-2 text-stone-700 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={pendingOnly}
                onChange={(e) => setPendingOnly(e.target.checked)}
                className="rounded bg-white border-stone-300 text-indigo-600 focus:ring-0"
              />
              Pending Dues Only
            </label>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setPage(1);
                  handleFetch(1);
                }}
                size="sm"
                variant="secondary"
                className="h-9 px-4 font-bold border border-stone-300 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-750"
              >
                Apply Filter
              </Button>

              <Button
                onClick={() => {
                  setMonth("");
                  setStatus("");
                  setPendingOnly(false);
                  setSearch("");
                  setPage(1);
                  // Refresh status query with base parameters
                  startTransition(async () => {
                    try {
                      const res = await getClassWiseFeeStatusReportAction({
                        sessionId,
                        classId,
                        sectionId: sectionId || undefined,
                        page: 1,
                        pageSize,
                      });
                      setReportData(res as any);
                      toast.success("Filters cleared successfully");
                    } catch (err: any) {
                      toast.error("Failed to clear filters: " + err.message);
                    }
                  });
                }}
                size="sm"
                variant="outline"
                className="h-9 px-3 border-stone-300 bg-white text-stone-600 hover:bg-stone-50 rounded-lg"
              >
                Clear Filters
              </Button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowExportModal(true)}
                className="h-9 border-stone-300 bg-white text-stone-700 font-bold hover:bg-stone-50"
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export Options
              </Button>
            </div>
          </div>

          {/* ── PROFESSIONAL ERP TABLE ── */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
              <table className="w-full text-left text-xs border-collapse relative">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 bg-stone-50 sticky top-0 z-10 font-bold">
                    <th className="p-3 w-10 text-center"></th>
                    <th className="p-3">Admission No</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Father Name</th>
                    <th className="p-3">Class</th>
                    <th className="p-3 text-right">Expected</th>
                    <th className="p-3 text-right text-emerald-700">Paid</th>
                    <th className="p-3 text-right text-rose-700">Pending</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3">Last Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150">
                  {reportData.items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-stone-400 font-medium">
                        No students match the current filters.
                      </td>
                    </tr>
                  ) : (
                    reportData.items.map((row) => {
                      const isExpanded = !!expandedStudents[row.studentId];
                      return (
                        <Fragment key={row.studentId}>
                          {/* Main Row */}
                          <tr className="hover:bg-stone-50/40 bg-white font-medium">
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => toggleStudent(row.studentId)}
                                className="p-1 rounded hover:bg-stone-100 text-stone-500"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </td>
                            <td className="p-3 font-mono text-stone-600">{row.admissionNo}</td>
                            <td className="p-3 font-bold text-stone-900">{row.studentName}</td>
                            <td className="p-3 text-stone-650">{row.fatherName}</td>
                            <td className="p-3 text-stone-650">
                              {row.className}-{row.sectionName}
                            </td>
                            <td className="p-3 text-right font-mono text-stone-800">{formatCurrency(row.expectedFee)}</td>
                            <td className="p-3 text-right font-mono text-emerald-700">{formatCurrency(row.paid)}</td>
                            <td className="p-3 text-right font-mono text-rose-750 font-black">
                              {formatCurrency(row.pending)}
                            </td>
                            <td className="p-3 text-center">
                              <Badge
                                  variant={
                                    row.paymentStatus === "PAID"
                                      ? "success"
                                      : row.paymentStatus === "PARTIAL"
                                      ? "warning"
                                      : "destructive"
                                  }
                                  className="rounded text-[9px] font-bold"
                                >
                                  {row.paymentStatus}
                                </Badge>
                            </td>
                            <td className="p-3 text-stone-500">
                              {row.lastPaymentDate ? formatDate(row.lastPaymentDate) : "—"}
                            </td>
                          </tr>

                          {/* Expanded Detail Accordion Row */}
                          {isExpanded && (
                            <tr className="bg-stone-50/50 border-t border-stone-200">
                              <td colSpan={10} className="p-4 pl-12">
                                <div className="border border-stone-200 rounded-lg overflow-hidden max-w-3xl bg-white shadow-sm">
                                  <div className="bg-stone-50 px-3.5 py-2 text-[10px] uppercase font-bold text-stone-500 tracking-wider border-b border-stone-200">
                                    Monthly Fee Summaries
                                  </div>
                                  <table className="w-full text-[11px] text-left">
                                    <thead>
                                      <tr className="border-b border-stone-150 text-stone-500 bg-stone-50/55 font-semibold">
                                        <th className="p-2">Month</th>
                                        <th className="p-2 text-right">Expected Amount</th>
                                        <th className="p-2 text-right text-emerald-700">Discount</th>
                                        <th className="p-2 text-right">Late Fine</th>
                                        <th className="p-2 text-right text-emerald-700">Paid</th>
                                        <th className="p-2 text-right text-rose-700 font-bold">Pending</th>
                                        <th className="p-2 text-center">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stone-150">
                                      {Object.values(
                                        row.feeDetails.reduce((acc, curr) => {
                                          const m = curr.month;
                                          if (!acc[m]) {
                                            acc[m] = {
                                              month: m,
                                              amount: 0,
                                              discount: 0,
                                              fine: 0,
                                              paid: 0,
                                              pending: 0,
                                            };
                                          }
                                          acc[m].amount += curr.amount;
                                          acc[m].discount += curr.discount;
                                          acc[m].fine += curr.fine;
                                          acc[m].paid += curr.paid;
                                          acc[m].pending += curr.pending;
                                          return acc;
                                        }, {} as Record<string, { month: string; amount: number; discount: number; fine: number; paid: number; pending: number }>)
                                      ).map((monthSum) => {
                                        const netPayable = Math.max(0, monthSum.amount - monthSum.discount) + monthSum.fine;
                                        let statusText = "PENDING";
                                        if (monthSum.paid >= netPayable && netPayable > 0) {
                                          statusText = "PAID";
                                        } else if (monthSum.paid > 0) {
                                          statusText = "PARTIAL";
                                        }

                                        return (
                                          <tr key={monthSum.month} className="hover:bg-stone-50/30">
                                            <td className="p-2 font-bold text-stone-800">{monthSum.month}</td>
                                            <td className="p-2 text-right font-mono">{formatCurrency(monthSum.amount)}</td>
                                            <td className="p-2 text-right font-mono text-emerald-650">
                                              {formatCurrency(monthSum.discount)}
                                            </td>
                                            <td className="p-2 text-right font-mono text-amber-700">
                                              {formatCurrency(monthSum.fine)}
                                            </td>
                                            <td className="p-2 text-right font-mono text-emerald-700">
                                              {formatCurrency(monthSum.paid)}
                                            </td>
                                            <td className="p-2 text-right font-mono text-rose-700 font-extrabold">
                                              {formatCurrency(monthSum.pending)}
                                            </td>
                                            <td className="p-2 text-center">
                                              <Badge
                                                variant={statusText === "PAID" ? "success" : statusText === "PARTIAL" ? "warning" : "destructive"}
                                                className="rounded-sm text-[8px] px-1 py-0"
                                              >
                                                {statusText}
                                              </Badge>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="bg-stone-50 border-t border-stone-200 px-4 py-3 flex items-center justify-between">
                <Button
                  disabled={page <= 1 || isPending}
                  onClick={() => {
                    const prev = page - 1;
                    setPage(prev);
                    handleFetch(prev);
                  }}
                  size="sm"
                  variant="outline"
                  className="h-8 border-stone-300 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>
                <div className="text-xs text-stone-500 font-semibold">
                  Page <span className="font-bold text-stone-850">{page}</span> of {totalPages}
                </div>
                <Button
                  disabled={page >= totalPages || isPending}
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    handleFetch(next);
                  }}
                  size="sm"
                  variant="outline"
                  className="h-8 border-stone-300 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50"
                >
                  Next <ChevronRightIcon className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EXPORT MODAL DIALOG ── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-5 w-full max-w-md space-y-4 shadow-xl animate-scale-up">
            <h3 className="text-sm font-black text-stone-900">Export Report Options</h3>
            <p className="text-xs text-stone-550">
              Select your reporting boundaries to export data cleanly.
            </p>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <button
                onClick={() => triggerExport("CSV_ALL")}
                className="p-3 text-left rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-800 font-semibold"
              >
                Export Selected Class ({metaData.classes.find((c) => c.id === classId)?.name})
              </button>
              <button
                onClick={() => triggerExport("CSV_PENDING")}
                className="p-3 text-left rounded-xl bg-stone-50 border border-stone-200 hover:bg-rose-50/50 text-rose-700 font-bold"
              >
                Export Only Pending Students
              </button>
            </div>
            <div className="flex justify-end gap-2 text-xs pt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowExportModal(false)}
                className="text-stone-500 hover:text-stone-800"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

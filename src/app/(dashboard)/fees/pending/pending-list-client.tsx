"use client";

import { useState, useTransition, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Search,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { getClasswisePendingListAction } from "@/server/actions/financial-reports.actions";
import Link from "next/link";
import { toast } from "sonner";

interface StudentPendingRow {
  studentId: string;
  studentName: string;
  admissionNo: string;
  classLabel: string;
  fatherName: string;
  phone: string;
  expectedFee: number;
  paid: number;
  pending: number;
  calculatedFine: number;
  waivedFine: number;
  finalFine: number;
  discount: number;
  monthsPending: string;
  currentStatus: string;
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

export function PendingListClient({ metaData }: { metaData: MetaData }) {
  const [isPending, startTransition] = useTransition();

  // Step Filters
  const [sessionId, setSessionId] = useState(metaData.activeSessionId);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  // Report Data
  const [reportData, setReportData] = useState<{
    items: StudentPendingRow[];
    total: number;
    summary: {
      totalPending: number;
      studentsPending: number;
    };
  } | null>(null);

  // Other filter states
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [feeHeadId, setFeeHeadId] = useState("");
  const [status, setStatus] = useState("");
  const [minPending, setMinPending] = useState("");
  const [maxPending, setMaxPending] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Export Modal Dialog
  const [showExportModal, setShowExportModal] = useState(false);

  const handleFetch = (customPage?: number) => {
    if (!classId) {
      toast.error("Please select a Class first");
      return;
    }

    const nextPage = customPage !== undefined ? customPage : page;

    startTransition(async () => {
      try {
        const res = await getClasswisePendingListAction({
          sessionId,
          classId,
          sectionId: sectionId || undefined,
          month: month || undefined,
          feeHeadId: feeHeadId || undefined,
          minPending: minPending ? parseFloat(minPending) : undefined,
          maxPending: maxPending ? parseFloat(maxPending) : undefined,
          search: search || undefined,
          status: status || undefined,
          page: nextPage,
          pageSize,
        });
        setReportData(res as any);
      } catch (err: any) {
        toast.error("Failed to load pending dues: " + err.message);
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
    toast.success(`Exporting report as ${mode}...`);

    let rowsToExport = reportData?.items || [];
    if (mode === "CSV_PENDING") {
      rowsToExport = rowsToExport.filter((r) => r.pending > 0);
    }

    const headers =
      "Admission No,Name,Class/Section,Father Name,Phone,Expected Fee,Paid,Pending,Fine,Discount,Status,Pending Months\n";
    const body = rowsToExport
      .map(
        (r) =>
          `"${r.admissionNo}","${r.studentName}","${r.classLabel}","${r.fatherName}","${r.phone}",${r.expectedFee},${r.paid},${r.pending},${r.finalFine},${r.discount},"${r.currentStatus}","${r.monthsPending}"`
      )
      .join("\n");

    const blob = new Blob([headers + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pending_dues_${classId}_${Date.now()}.csv`;
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

          {/* Step 4: Load Data Button */}
          <div className="flex items-end h-full pt-4">
            <Button
              disabled={!classId || isPending}
              onClick={() => {
                setPage(1);
                handleFetch(1);
              }}
              className="bg-stone-900 hover:bg-stone-850 text-white font-extrabold h-9 px-5 rounded-lg transition-all"
            >
              Load Pending Dues
            </Button>
          </div>
        </div>
      </div>

      {/* ── CONDITIONAL EMPTY STATE OR REPORT ── */}
      {!reportData ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-16 text-center text-stone-500 shadow-sm">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30 text-stone-400" />
          <h3 className="text-sm font-black text-stone-800">Select Academic Session & Class to view pending dues</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            Operational view loading dues class-by-class for high database performance.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── SIMPLIFIED KPI CARDS ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-rose-50 border-rose-200 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-rose-700">Total Pending Amount</p>
                  <h3 className="text-2xl font-black text-rose-800 mt-1 font-mono">
                    {formatCurrency(reportData.summary.totalPending)}
                  </h3>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-stone-200 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-stone-500">Defaulter Students Count</p>
                  <h3 className="text-2xl font-black text-stone-900 mt-1 font-mono">
                    {reportData.summary.studentsPending}
                  </h3>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── ADVANCED FILTERS BAR ── */}
          <div className="bg-white border border-stone-200 p-4 rounded-xl flex flex-wrap items-center gap-3 text-xs print:hidden shadow-sm">
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, adm no, parents, phone..."
                className="pl-9 bg-white border-stone-300 text-stone-900 h-9 rounded-lg"
              />
            </div>

            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-white border-stone-300 text-stone-900 h-9 w-32 rounded-lg"
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
              value={feeHeadId}
              onChange={(e) => setFeeHeadId(e.target.value)}
              className="bg-white border-stone-300 text-stone-900 h-9 w-36 rounded-lg"
            >
              <option value="">All Fee Heads</option>
              {metaData.feeHeads.map((fh) => (
                <option key={fh.id} value={fh.id}>
                  {fh.name}
                </option>
              ))}
            </Select>

            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-white border-stone-300 text-stone-900 h-9 w-32 rounded-lg"
            >
              <option value="">Dues Pending</option>
              <option value="UNPAID">Totally Unpaid</option>
              <option value="PARTIAL">Partially Paid</option>
              <option value="PAID">Fully Paid</option>
            </Select>

            <Input
              type="number"
              placeholder="Min Pending"
              value={minPending}
              onChange={(e) => setMinPending(e.target.value)}
              className="bg-white border-stone-300 text-stone-900 h-9 w-28 rounded-lg"
            />

            <Input
              type="number"
              placeholder="Max Pending"
              value={maxPending}
              onChange={(e) => setMaxPending(e.target.value)}
              className="bg-white border-stone-300 text-stone-900 h-9 w-28 rounded-lg"
            />

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
                  setSearch("");
                  setMonth("");
                  setFeeHeadId("");
                  setStatus("");
                  setMinPending("");
                  setMaxPending("");
                  setPage(1);
                  startTransition(async () => {
                    try {
                      const res = await getClasswisePendingListAction({
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
                className="h-9 border-stone-300 bg-white text-stone-700 font-bold hover:bg-stone-50 rounded-lg animate-fade-in"
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export Options
              </Button>
            </div>
          </div>

          {/* ── DEFAULTERS LIST TABLE ── */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
              <table className="w-full text-left text-xs border-collapse relative">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 bg-stone-50 sticky top-0 z-10 font-bold">
                    <th className="p-3">Adm No</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Class/Sec</th>
                    <th className="p-3">Father Name</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3 text-right">Expected</th>
                    <th className="p-3 text-right text-emerald-700">Paid</th>
                    <th className="p-3 text-right text-rose-705">Pending</th>
                    <th className="p-3 text-center">Months Overdue</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150">
                  {reportData.items.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-12 text-center text-stone-400 font-medium">
                        No pending student statements match the criteria.
                      </td>
                    </tr>
                  ) : (
                    reportData.items.map((row) => (
                      <tr key={row.studentId} className="hover:bg-stone-50/30">
                        <td className="p-3 font-mono text-stone-600">{row.admissionNo}</td>
                        <td className="p-3 font-bold text-stone-900">{row.studentName}</td>
                        <td className="p-3 text-stone-705 font-medium">{row.classLabel}</td>
                        <td className="p-3 text-stone-700">{row.fatherName}</td>
                        <td className="p-3 text-stone-600">{row.phone}</td>
                        <td className="p-3 text-right font-mono text-stone-850">{formatCurrency(row.expectedFee)}</td>
                        <td className="p-3 text-right font-mono text-emerald-700">{formatCurrency(row.paid)}</td>
                        <td className="p-3 text-right font-mono text-rose-750 font-extrabold">
                          {formatCurrency(row.pending)}
                        </td>
                        <td className="p-3 text-center text-stone-600 font-semibold">{row.monthsPending}</td>
                        <td className="p-3 text-center">
                          <Badge
                            variant={
                              row.currentStatus === "PAID"
                                ? "success"
                                : row.currentStatus === "PARTIAL"
                                ? "warning"
                                : "destructive"
                            }
                            className="rounded text-[9px] font-bold"
                          >
                            {row.currentStatus}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <Link
                            href={`/fees?studentId=${row.studentId}`}
                            className="text-xs text-indigo-600 hover:text-indigo-850 font-bold flex items-center justify-end gap-1"
                          >
                            Profile <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
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
                  className="h-8 border-stone-300 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50 rounded-lg"
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
                  className="h-8 border-stone-300 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50 rounded-lg"
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
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
            <h3 className="text-sm font-black text-stone-900">Export Dues Options</h3>
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

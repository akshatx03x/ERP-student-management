"use client";

import { useState, useTransition, useMemo, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  Clock,
  Percent,
  CheckCircle,
  AlertCircle,
  Users,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Printer,
  Download,
  Calendar,
} from "lucide-react";
import { getPrincipalFinanceDashboardDynamicAction } from "@/server/actions/financial-reports.actions";
import Link from "next/link";
import { toast } from "sonner";

interface SectionSummary {
  sectionId: string;
  sectionName: string;
  totalStudents: number;
  expected: number;
  paid: number;
  remaining: number;
  collectionPercent: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
}

interface ClassSummary {
  classId: string;
  className: string;
  totalStudents: number;
  expected: number;
  paid: number;
  remaining: number;
  collectionPercent: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  sections: SectionSummary[];
}

interface InitialData {
  sessions: { id: string; name: string; isCurrent: boolean }[];
  classes: {
    id: string;
    name: string;
    sections: { id: string; name: string }[];
  }[];
  activeSessionId: string;
  kpis: {
    totalExpected: number;
    totalCollected: number;
    totalPending: number;
    collectionPercent: number;
    todayCollection: number;
    monthCollection: number;
    paidStudentsCount: number;
    partialStudentsCount: number;
    unpaidStudentsCount: number;
  };
  summaryRows: ClassSummary[];
  monthlyCollections: Record<string, number>;
}

export function FinanceDashboardClient({ initialData }: { initialData: InitialData }) {
  const [data, setData] = useState<InitialData>(initialData);
  const [isPending, startTransition] = useTransition();

  // Filters state
  const [sessionId, setSessionId] = useState(initialData.activeSessionId);
  const [month, setMonth] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Accordion UI state for rows
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});

  const toggleClass = (id: string) => {
    setExpandedClasses((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFilterChange = (updates: {
    sessionId?: string;
    month?: string;
    classId?: string;
    sectionId?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    let nextSessionId = updates.sessionId !== undefined ? updates.sessionId : sessionId;
    let nextMonth = updates.month !== undefined ? updates.month : month;
    let nextClassId = updates.classId !== undefined ? updates.classId : classId;
    let nextSectionId = updates.sectionId !== undefined ? updates.sectionId : sectionId;
    let nextStartDate = updates.startDate !== undefined ? updates.startDate : startDate;
    let nextEndDate = updates.endDate !== undefined ? updates.endDate : endDate;

    // Reset section filter if class changes
    if (updates.classId !== undefined) {
      nextSectionId = "";
      setSectionId("");
    }

    setSessionId(nextSessionId);
    setMonth(nextMonth);
    setClassId(nextClassId);
    setStartDate(nextStartDate);
    setEndDate(nextEndDate);

    startTransition(async () => {
      try {
        const payload = {
          sessionId: nextSessionId || undefined,
          month: nextMonth || undefined,
          classId: nextClassId || undefined,
          sectionId: nextSectionId || undefined,
          startDate: nextStartDate ? new Date(nextStartDate) : undefined,
          endDate: nextEndDate ? new Date(nextEndDate) : undefined,
        };
        const updated = await getPrincipalFinanceDashboardDynamicAction(payload);
        setData(updated as any);
      } catch (err: any) {
        toast.error("Failed to load dashboard data: " + err.message);
      }
    });
  };

  const selectedClassSections = useMemo(() => {
    if (!classId) return [];
    const cls = initialData.classes.find((c) => c.id === classId);
    return cls ? cls.sections : [];
  }, [classId, initialData.classes]);

  const exportSummary = () => {
    const header = "Class,Section,Total Students,Expected Collection,Collected,Pending,Collection %\n";
    const body = data.summaryRows
      .flatMap((c) => {
        const main = `"${c.className}","Total",${c.totalStudents},${c.expected},${c.paid},${c.remaining},${c.collectionPercent}`;
        const secs = c.sections.map(
          (s) =>
            `"${c.className}","${s.sectionName}",${s.totalStudents},${s.expected},${s.paid},${s.remaining},${s.collectionPercent}`
        );
        return [main, ...secs];
      })
      .join("\n");

    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finance_summary_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ── FILTER HEADER BAR ── */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          {/* Session Selector */}
          <div className="w-40">
            <Select
              value={sessionId}
              onChange={(e) => handleFilterChange({ sessionId: e.target.value })}
              className="w-full bg-slate-950 border-slate-800 text-slate-205 text-xs h-9"
            >
              {data.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isCurrent ? "(Current)" : ""}
                </option>
              ))}
            </Select>
          </div>

          {/* Month Selector */}
          <div className="w-36">
            <Select
              value={month}
              onChange={(e) => handleFilterChange({ month: e.target.value })}
              className="w-full bg-slate-955 border-slate-800 text-slate-205 text-xs h-9"
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
          </div>

          {/* Class Selector */}
          <div className="w-36">
            <Select
              value={classId}
              onChange={(e) => handleFilterChange({ classId: e.target.value })}
              className="w-full bg-slate-955 border-slate-800 text-slate-205 text-xs h-9"
            >
              <option value="">All Classes</option>
              {initialData.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Section Selector */}
          <div className="w-32">
            <Select
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                handleFilterChange({ sectionId: e.target.value });
              }}
              disabled={!classId}
              className="w-full bg-slate-955 border-slate-850 text-slate-205 text-xs h-9 disabled:opacity-50"
            >
              <option value="">All Sections</option>
              {selectedClassSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Start Date */}
          <div className="w-36 relative">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => handleFilterChange({ startDate: e.target.value })}
              className="w-full bg-slate-955 border-slate-850 text-slate-205 text-xs h-9 pl-3 pr-2"
            />
          </div>

          {/* End Date */}
          <div className="w-36 relative">
            <Input
              type="date"
              value={endDate}
              onChange={(e) => handleFilterChange({ endDate: e.target.value })}
              className="w-full bg-slate-955 border-slate-850 text-slate-205 text-xs h-9 pl-3 pr-2"
            />
          </div>

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={exportSummary} className="h-9 text-xs border-slate-800 bg-slate-955 text-slate-300">
              <Download className="w-3.5 h-3.5 mr-1" /> Export Summary
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()} className="h-9 text-xs">
              <Printer className="w-3.5 h-3.5 mr-1" /> Print
            </Button>
          </div>
        </div>

        {isPending && (
          <p className="text-[11px] text-indigo-400 animate-pulse font-semibold">Refreshing dashboard metrics...</p>
        )}
      </div>

      {/* ── KPI METRIC CARDS GRID ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-9 gap-3">
        {/* Expected */}
        <Card className="bg-slate-900 border-slate-800 xl:col-span-2">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-indigo-400" /> Expected Collection
              </p>
              <h3 className="text-xl font-black text-slate-100 mt-2">{formatCurrency(data.kpis.totalExpected)}</h3>
            </div>
          </CardContent>
        </Card>

        {/* Collected */}
        <Card className="bg-emerald-950/20 border-emerald-900/50 xl:col-span-2">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div>
              <p className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Total Collected
              </p>
              <h3 className="text-xl font-black text-emerald-300 mt-2">{formatCurrency(data.kpis.totalCollected)}</h3>
            </div>
            <p className="text-[10px] text-emerald-500 font-semibold mt-1">Collection rate: {data.kpis.collectionPercent}%</p>
          </CardContent>
        </Card>

        {/* Pending */}
        <Card className="bg-rose-950/20 border-rose-900/50 xl:col-span-2">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div>
              <p className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-400" /> Total Pending
              </p>
              <h3 className="text-xl font-black text-rose-300 mt-2">{formatCurrency(data.kpis.totalPending)}</h3>
            </div>
          </CardContent>
        </Card>

        {/* Collection % */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-blue-400" /> Collection %
            </p>
            <h3 className="text-xl font-black text-blue-300 mt-2">{data.kpis.collectionPercent}%</h3>
          </CardContent>
        </Card>

        {/* Today's Collection */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Today's
            </p>
            <h3 className="text-base font-bold text-slate-100 mt-2">{formatCurrency(data.kpis.todayCollection)}</h3>
          </CardContent>
        </Card>

        {/* This Month's Collection */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" /> This Month
            </p>
            <h3 className="text-base font-bold text-slate-100 mt-2">{formatCurrency(data.kpis.monthCollection)}</h3>
          </CardContent>
        </Card>
      </div>

      {/* Student stats KPI group */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Total Fully Paid Students</p>
              <h4 className="text-2xl font-black text-emerald-400 mt-1">{data.kpis.paidStudentsCount}</h4>
            </div>
            <CheckCircle className="w-8 h-8 text-emerald-900/40" />
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Partially Paid Students</p>
              <h4 className="text-2xl font-black text-amber-400 mt-1">{data.kpis.partialStudentsCount}</h4>
            </div>
            <Users className="w-8 h-8 text-amber-900/40" />
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Unpaid / Defaulter Students</p>
              <h4 className="text-2xl font-black text-rose-400 mt-1">{data.kpis.unpaidStudentsCount}</h4>
            </div>
            <AlertCircle className="w-8 h-8 text-rose-900/40" />
          </CardContent>
        </Card>
      </div>

      {/* ── CLASS-WISE COLLECTION BREAKDOWN TABLE ── */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold text-slate-100">
            Class-wise Fee Collection Summary
          </CardTitle>
          <Link href="/fees/pending" className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
            Open Defaulters List <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/70">
                  <th className="p-3.5 font-bold w-12 text-center">+/-</th>
                  <th className="p-3.5 font-bold">Class / Section</th>
                  <th className="p-3.5 font-bold text-center">Total Students</th>
                  <th className="p-3.5 font-bold text-right">Expected</th>
                  <th className="p-3.5 font-bold text-right text-emerald-400">Collected</th>
                  <th className="p-3.5 font-bold text-right text-rose-400">Pending</th>
                  <th className="p-3.5 font-bold text-center">Collection %</th>
                  <th className="p-3.5 font-bold text-center">Paid / Partial / Unpaid</th>
                  <th className="p-3.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {data.summaryRows.map((row) => {
                  const isExpanded = !!expandedClasses[row.classId];
                  return (
                    <Fragment key={row.classId}>
                      {/* Class Row */}
                      <tr className="hover:bg-slate-850 bg-slate-900/40">
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleClass(row.classId)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="p-3 font-extrabold text-slate-200">{row.className}</td>
                        <td className="p-3 text-center text-slate-300 font-semibold">{row.totalStudents}</td>
                        <td className="p-3 text-right font-mono text-slate-300">{formatCurrency(row.expected)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400 font-semibold">
                          {formatCurrency(row.paid)}
                        </td>
                        <td className="p-3 text-right font-mono text-rose-400 font-bold">
                          {formatCurrency(row.remaining)}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-950 text-indigo-300 border border-indigo-850">
                            {row.collectionPercent}%
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-400">
                          <span className="text-emerald-400 font-bold">{row.paidCount}</span> /{" "}
                          <span className="text-amber-400 font-bold">{row.partialCount}</span> /{" "}
                          <span className="text-rose-400 font-bold">{row.unpaidCount}</span>
                        </td>
                        <td className="p-3 text-right">
                          <Link
                            href={`/fees/pending?classId=${row.classId}&sessionId=${sessionId}`}
                            className="text-xs text-indigo-400 hover:underline font-bold"
                          >
                            View Pending
                          </Link>
                        </td>
                      </tr>

                      {/* Section Rows (Accordion Expandable) */}
                      {isExpanded &&
                        row.sections.map((sec) => (
                          <tr key={sec.sectionId} className="bg-slate-950/30 hover:bg-slate-955/50 border-t border-slate-900">
                            <td></td>
                            <td className="p-3 pl-8 text-slate-400 font-medium">— Section {sec.sectionName}</td>
                            <td className="p-3 text-center text-slate-400">{sec.totalStudents}</td>
                            <td className="p-3 text-right font-mono text-slate-400">{formatCurrency(sec.expected)}</td>
                            <td className="p-3 text-right font-mono text-emerald-500/80">
                              {formatCurrency(sec.paid)}
                            </td>
                            <td className="p-3 text-right font-mono text-rose-500/80">
                              {formatCurrency(sec.remaining)}
                            </td>
                            <td className="p-3 text-center">
                              <span className="text-slate-400 font-semibold">{sec.collectionPercent}%</span>
                            </td>
                            <td className="p-3 text-center text-slate-500">
                              <span className="text-emerald-500/80">{sec.paidCount}</span> /{" "}
                              <span className="text-amber-500/80">{sec.partialCount}</span> /{" "}
                              <span className="text-rose-500/80">{sec.unpaidCount}</span>
                            </td>
                            <td className="p-3 text-right">
                              <Link
                                href={`/fees/pending?classId=${row.classId}&sectionId=${sec.sectionId}&sessionId=${sessionId}`}
                                className="text-xs text-slate-400 hover:text-slate-200 font-medium"
                              >
                                View Section dues
                              </Link>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  listAttendanceAction,
  markAttendanceAction,
  toggleMonthLockAction,
  getLockedMonthsAction,
  exportAttendanceExcelAction,
  getSectionSessionRecordsAction,
  listHolidaysAction,
} from "@/server/actions/ops.actions";
import {
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lock,
  Unlock,
  Download,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Clock,
  HelpCircle,
} from "lucide-react";

type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };
type Session = { id: string; name: string; startDate?: string | Date; endDate?: string | Date };

interface AttendanceClientProps {
  classes: ClassRow[];
  sessions: Session[];
  currentSessionId: string | null;
  userRole: string;
}

export function AttendanceClient({
  classes,
  sessions,
  currentSessionId,
  userRole,
}: AttendanceClientProps) {
  const [pending, startTransition] = useTransition();

  // Filters state
  const [sessionId, setSessionId] = useState(currentSessionId ?? sessions[0]?.id ?? "");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const sections = useMemo(() => classes.find((c) => c.id === classId)?.sections ?? [], [classes, classId]);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  // Roster and session data
  const [rows, setRows] = useState<Array<{ studentId: string; fullName: string; admissionNo: string; rollNo: string; status: string; remarks: string }>>([]);
  const [sessionRecords, setSessionRecords] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [lockedMonths, setLockedMonths] = useState<Set<string>>(new Set()); // key format: YYYY-MM
  const [isLoaded, setIsLoaded] = useState(false);

  // Month Picker for Calendar
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1); // 1-12

  // Current session date range
  const currentSession = useMemo(() => sessions.find((s) => s.id === sessionId), [sessions, sessionId]);

  // Load holidays and locked status on mount/session change
  useEffect(() => {
    async function initSessionData() {
      try {
        const [holidayRes, locksRes] = await Promise.all([
          listHolidaysAction({ pageSize: 100 }),
          getLockedMonthsAction(sessionId),
        ]);
        
        const hSet = new Set<string>(holidayRes.items.map((h: any) => new Date(h.date).toISOString().slice(0, 10)));
        setHolidays(hSet);

        const lSet = new Set<string>(locksRes.map((l: any) => `${l.year}-${String(l.month).padStart(2, "0")}`));
        setLockedMonths(lSet);
      } catch (err) {
        console.error("Failed to load initial session data:", err);
      }
    }
    if (sessionId) {
      initSessionData();
    }
  }, [sessionId]);

  // Check if selected date's month is locked
  const isCurrentDateLocked = useMemo(() => {
    if (!date) return false;
    const d = new Date(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return lockedMonths.has(key);
  }, [date, lockedMonths]);

  // 1. Dashboard summary calculation
  const stats = useMemo(() => {
    if (rows.length === 0) return { total: 0, present: 0, absent: 0, leave: 0, percentage: 0 };
    const total = rows.length;
    const present = rows.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
    const absent = rows.filter((r) => r.status === "ABSENT").length;
    const leave = rows.filter((r) => r.status === "EXCUSED").length;
    const percentage = total > 0 ? Math.round(((present + leave) / total) * 100) : 0;
    return { total, present, absent, leave, percentage };
  }, [rows]);

  // Get active session working days up to today (excluding Sundays and Holidays)
  const sessionWorkingDays = useMemo(() => {
    if (!currentSession?.startDate || !currentSession?.endDate) return [];
    const start = new Date(currentSession.startDate);
    const today = new Date();
    const end = new Date(currentSession.endDate) > today ? today : new Date(currentSession.endDate);

    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const isSunday = d.getDay() === 0;
      const isHoliday = holidays.has(key);
      if (!isSunday && !isHoliday) {
        days.push(key);
      }
    }
    return days.sort();
  }, [currentSession, holidays]);

  // 2. Student attendance summary details
  const studentSummaries = useMemo(() => {
    if (rows.length === 0) return [];
    
    const currentDateKey = new Date(date).toISOString().slice(0, 10);
    
    // Unique dates in session records (excluding the current date)
    const pastDates = new Set(
      sessionRecords
        .map(r => new Date(r.date).toISOString().slice(0, 10))
        .filter(d => d !== currentDateKey)
    );
    const totalWorkingDays = pastDates.size + 1; // +1 for the current day

    return rows.map((student) => {
      const studentRecs = sessionRecords.filter(
        (r) => r.studentId === student.studentId && new Date(r.date).toISOString().slice(0, 10) !== currentDateKey
      );
      
      let present = 0;
      let absent = 0;
      let leave = 0;

      // 1. Add past records
      studentRecs.forEach((r) => {
        if (r.status === "PRESENT" || r.status === "LATE") {
          present += 1;
        } else if (r.status === "ABSENT") {
          absent += 1;
        } else if (r.status === "EXCUSED") {
          leave += 1;
        } else if (r.status === "HALF_DAY") {
          present += 0.5;
          absent += 0.5;
        }
      });

      // 2. Add current active row status from screen state
      const currentStatus = student.status;
      if (currentStatus === "PRESENT" || currentStatus === "LATE") {
        present += 1;
      } else if (currentStatus === "ABSENT") {
        absent += 1;
      } else if (currentStatus === "EXCUSED") {
        leave += 1;
      } else if (currentStatus === "HALF_DAY") {
        present += 0.5;
        absent += 0.5;
      }

      const totalDays = totalWorkingDays;
      const percentage = totalDays > 0 ? Math.round(((present + leave) / totalDays) * 100) : 0;

      return {
        studentId: student.studentId,
        studentName: student.fullName,
        admissionNo: student.admissionNo,
        rollNo: student.rollNo,
        present,
        absent,
        leave,
        totalDays,
        percentage,
      };
    });
  }, [rows, sessionRecords, date]);

  // Calendar rendering helper
  const calendarDays = useMemo(() => {
    const startOfMonth = new Date(Date.UTC(calendarYear, calendarMonth - 1, 1));
    const endOfMonth = new Date(Date.UTC(calendarYear, calendarMonth, 0));
    const daysInMonth = endOfMonth.getUTCDate();
    const startDayOfWeek = startOfMonth.getUTCDay(); // 0 is Sunday

    const grid = [];
    // Padding for empty space before 1st of month
    for (let i = 0; i < startDayOfWeek; i++) {
      grid.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDay = new Date(Date.UTC(calendarYear, calendarMonth - 1, day));
      const dateStr = currentDay.toISOString().slice(0, 10);
      const isSunday = currentDay.getUTCDay() === 0;
      const isHoliday = holidays.has(dateStr);

      // Find status breakdown for the class on this day
      const dayRecords = sessionRecords.filter(
        (r) => new Date(r.date).toISOString().slice(0, 10) === dateStr
      );

      const present = dayRecords.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
      const absent = dayRecords.filter((r) => r.status === "ABSENT").length;
      const leave = dayRecords.filter((r) => r.status === "EXCUSED").length;

      grid.push({
        day,
        dateStr,
        isSunday,
        isHoliday,
        present,
        absent,
        leave,
        hasRecords: dayRecords.length > 0,
      });
    }
    return grid;
  }, [calendarYear, calendarMonth, holidays, sessionRecords]);

  // Load roster
  function load() {
    startTransition(async () => {
      try {
        const [dailyData, sessionData] = await Promise.all([
          listAttendanceAction({ sessionId, sectionId, date: new Date(date) }),
          getSectionSessionRecordsAction(sessionId, sectionId),
        ]);

        setRows(
          dailyData.map((r) => ({
            studentId: r.student.id,
            fullName: r.student.fullName,
            admissionNo: r.student.admissionNo,
            rollNo: r.rollNo ?? "—",
            status: r.attendance?.status ?? "PRESENT",
            remarks: r.attendance?.remarks ?? "",
          }))
        );

        setSessionRecords(sessionData);
        setIsLoaded(true);
        toast.success("Attendance roster loaded successfully.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load roster");
      }
    });
  }

  // Save attendance
  async function save() {
    startTransition(async () => {
      try {
        await markAttendanceAction({
          sessionId,
          sectionId,
          date: new Date(date),
          records: rows.map((r) => ({
            studentId: r.studentId,
            status: r.status as any,
            remarks: r.remarks || null,
          })),
        });
        toast.success("Attendance saved successfully");
        
        // Refresh local session database records
        const freshRecords = await getSectionSessionRecordsAction(sessionId, sectionId);
        setSessionRecords(freshRecords);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save attendance");
      }
    });
  }

  // Toggle month lock (Principal only)
  async function toggleLock(targetYear: number, targetMonth: number, currentlyLocked: boolean) {
    startTransition(async () => {
      try {
        await toggleMonthLockAction({
          sessionId,
          year: targetYear,
          month: targetMonth,
          isLocked: !currentlyLocked,
        });

        const key = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
        setLockedMonths((prev) => {
          const next = new Set(prev);
          if (currentlyLocked) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });

        toast.success(`Month ${currentlyLocked ? "unlocked" : "locked"} successfully.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update lock status");
      }
    });
  }

  // Quick actions
  function markAll(status: "PRESENT" | "ABSENT" | "EXCUSED") {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  }

  function markRemainingPresent() {
    setRows((prev) =>
      prev.map((r) => (r.status === "PRESENT" || r.status === "ABSENT" || r.status === "EXCUSED" ? r : { ...r, status: "PRESENT" }))
    );
  }

  // Excel Export
  async function handleExport(type: "daily" | "monthly" | "session") {
    try {
      const filterInput: any = { sessionId, classId, sectionId };
      if (type === "daily") {
        filterInput.startDate = date;
        filterInput.endDate = date;
      } else if (type === "monthly") {
        const d = new Date(date);
        filterInput.month = d.getMonth() + 1;
        filterInput.year = d.getFullYear();
      }

      const base64 = await exportAttendanceExcelAction(filterInput);
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Attendance_${type}_${date}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Excel report exported successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  }

  const isPrincipal = userRole === "PRINCIPAL";

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 bg-slate-50 min-h-screen">
      {/* 2. Filters & Load Roster */}
      <Card className="border border-slate-200/80 shadow-md bg-white rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-bold text-slate-800">Attendance Filters</CardTitle>
          <CardDescription className="text-slate-500">Configure parameters to load the student roster</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Academic Session</label>
              <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Class</label>
              <Select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  const next = classes.find((c) => c.id === e.target.value)?.sections[0]?.id ?? "";
                  setSectionId(next);
                }}
              >
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Section</label>
              <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Date Picker</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="default" className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium animate-none" disabled={pending} onClick={load}>
                <RefreshCw className={cn("mr-2 h-4 w-4", pending && "animate-spin")} />
                Load Attendance
              </Button>
              {isLoaded && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || isCurrentDateLocked}
                  onClick={save}
                  className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-medium"
                >
                  Save Attendance
                </Button>
              )}
            </div>

            {isLoaded && (
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="border-indigo-600 text-indigo-700 hover:bg-indigo-50" onClick={() => handleExport("daily")}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export Selected Date
                </Button>
                <Button type="button" size="sm" variant="outline" className="border-indigo-600 text-indigo-700 hover:bg-indigo-50" onClick={() => handleExport("monthly")}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export Month
                </Button>
                <Button type="button" size="sm" variant="outline" className="border-indigo-600 text-indigo-700 hover:bg-indigo-50" onClick={() => handleExport("session")}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export Session
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lock alert bar */}
      {isLoaded && isCurrentDateLocked && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl shadow-sm">
          <Lock className="h-5 w-5 text-amber-600 flex-shrink-0 animate-pulse" />
          <div className="text-sm font-medium">
            This month's attendance records are currently locked by the administration. Teachers cannot modify or save records for this date.
          </div>
        </div>
      )}

      {isLoaded && (
        <>
          {/* 1. Dashboard summary stats */}
          <div className="grid gap-4 md:grid-cols-5">
            <Card className="border border-slate-100/90 shadow-sm bg-white hover:scale-[1.01] transition-transform">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Students</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{stats.total}</p>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600"><Users className="h-6 w-6" /></div>
              </CardContent>
            </Card>
            <Card className="border border-slate-100/90 shadow-sm bg-white hover:scale-[1.01] transition-transform">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Present</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{stats.present}</p>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600"><CheckCircle2 className="h-6 w-6" /></div>
              </CardContent>
            </Card>
            <Card className="border border-slate-100/90 shadow-sm bg-white hover:scale-[1.01] transition-transform">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Absent</p>
                  <p className="text-2xl font-black text-rose-600 mt-1">{stats.absent}</p>
                </div>
                <div className="bg-rose-50 p-3 rounded-lg text-rose-600"><XCircle className="h-6 w-6" /></div>
              </CardContent>
            </Card>
            <Card className="border border-slate-100/90 shadow-sm bg-white hover:scale-[1.01] transition-transform">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Leave</p>
                  <p className="text-2xl font-black text-blue-600 mt-1">{stats.leave}</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg text-blue-600"><HelpCircle className="h-6 w-6" /></div>
              </CardContent>
            </Card>
            <Card className="border border-slate-100/90 shadow-sm bg-white hover:scale-[1.01] transition-transform">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Attendance %</p>
                  <p className="text-2xl font-black text-indigo-600 mt-1">{stats.percentage}%</p>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600">
                  <div className="text-sm font-black font-mono">{stats.percentage}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 3. Roster / Attendance Register */}
          <Card className="border border-slate-200/80 shadow-md bg-white rounded-xl">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg font-bold text-slate-800">Attendance Register</CardTitle>
                <CardDescription className="text-slate-500">Record daily status below</CardDescription>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" disabled={isCurrentDateLocked} onClick={() => markAll("PRESENT")} className="text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                  Mark All Present
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={isCurrentDateLocked} onClick={() => markAll("ABSENT")} className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50">
                  Mark All Absent
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={isCurrentDateLocked} onClick={markRemainingPresent} className="text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                  Mark Remaining Present
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={isCurrentDateLocked} onClick={load} className="text-xs text-slate-600 border-slate-200 hover:bg-slate-50">
                  Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 uppercase text-xs font-semibold border-b">
                    <tr>
                      <th className="px-6 py-4">Roll No</th>
                      <th className="px-6 py-4">Admission No</th>
                      <th className="px-6 py-4">Student Name</th>
                      <th className="px-6 py-4">Attendance Status</th>
                      <th className="px-6 py-4">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                      <tr key={row.studentId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-slate-600">{row.rollNo}</td>
                        <td className="px-6 py-4 font-mono font-medium text-slate-600">{row.admissionNo}</td>
                        <td className="px-6 py-4 font-bold text-slate-800">{row.fullName}</td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            {[
                              { label: "Present", val: "PRESENT", activeClass: "bg-emerald-600 border-emerald-600 text-white" },
                              { label: "Absent", val: "ABSENT", activeClass: "bg-rose-600 border-rose-600 text-white" },
                              { label: "Leave", val: "EXCUSED", activeClass: "bg-blue-500 border-blue-500 text-white" },
                            ].map((opt) => {
                              const active = row.status === opt.val;
                              return (
                                <button
                                  key={opt.val}
                                  type="button"
                                  disabled={isCurrentDateLocked}
                                  onClick={() =>
                                    setRows((all) => all.map((x, i) => (i === idx ? { ...x, status: opt.val } : x)))
                                  }
                                  className={cn(
                                    "rounded-md px-3 py-1.5 text-xs font-bold border transition-all select-none shadow-sm cursor-pointer",
                                    active
                                      ? opt.activeClass
                                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                  )}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Input
                            type="text"
                            placeholder="Optional remark..."
                            value={row.remarks}
                            disabled={isCurrentDateLocked}
                            className="h-8 max-w-xs text-xs border-slate-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                            onChange={(e) =>
                              setRows((all) => all.map((x, i) => (i === idx ? { ...x, remarks: e.target.value } : x)))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 4. Monthly Calendar View */}
          <Card className="border border-slate-200/80 shadow-md bg-white rounded-xl">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-indigo-500" />
                  Attendance Calendar
                </CardTitle>
                <CardDescription className="text-slate-500">Day-by-day stats tracker</CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Select value={calendarMonth} onChange={(e) => setCalendarMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2000, i, 1).toLocaleString("default", { month: "short" })}
                    </option>
                  ))}
                </Select>
                <Select value={calendarYear} onChange={(e) => setCalendarYear(Number(e.target.value))}>
                  {[2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {/* Month lock controls (Principal/Admin only) */}
              <div className="flex items-center justify-between p-3 mb-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">Lock Status</span>
                </div>
                {isPrincipal ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={lockedMonths.has(`${calendarYear}-${String(calendarMonth).padStart(2, "0")}`) ? "destructive" : "outline"}
                    onClick={() =>
                      toggleLock(
                        calendarYear,
                        calendarMonth,
                        lockedMonths.has(`${calendarYear}-${String(calendarMonth).padStart(2, "0")}`)
                      )
                    }
                    className="text-xs font-bold cursor-pointer"
                  >
                    {lockedMonths.has(`${calendarYear}-${String(calendarMonth).padStart(2, "0")}`) ? (
                      <>
                        <Unlock className="mr-1 h-3 w-3" /> Unlock Month
                      </>
                    ) : (
                      <>
                        <Lock className="mr-1 h-3 w-3" /> Lock Month
                      </>
                    )}
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-slate-500">
                    {lockedMonths.has(`${calendarYear}-${String(calendarMonth).padStart(2, "0")}`) ? "Locked" : "Unlocked"}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="font-semibold text-slate-500 py-1">{day}</div>
                ))}
                {calendarDays.map((dayData, idx) => {
                  if (!dayData) return <div key={`empty-${idx}`} className="py-2.5"></div>;
                  
                  const isToday = dayData.dateStr === new Date().toISOString().slice(0, 10);
                  let color = "bg-white border-slate-200 hover:bg-slate-50 text-slate-800";
                  if (dayData.isSunday) {
                    color = "bg-slate-100 border-slate-100 text-slate-400 cursor-not-allowed";
                  } else if (dayData.isHoliday) {
                    color = "bg-amber-50 border-amber-200 text-amber-700 font-bold";
                  } else if (dayData.hasRecords) {
                    if (dayData.absent > 0) {
                      color = "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100/70";
                    } else {
                      color = "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100/70";
                    }
                  }

                  return (
                    <div
                      key={dayData.dateStr}
                      onClick={() => {
                        if (!dayData.isSunday) {
                          setDate(dayData.dateStr);
                          toast.info(`Switched date filter to ${dayData.dateStr}`);
                        }
                      }}
                      className={cn(
                        "py-2.5 border rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer relative",
                        isToday && "ring-2 ring-indigo-500 ring-offset-1",
                        color
                      )}
                    >
                      <span className="font-bold">{dayData.day}</span>
                      {dayData.hasRecords && !dayData.isSunday && !dayData.isHoliday && (
                        <span className="text-[9px] font-mono opacity-80 mt-0.5">
                          P:{dayData.present} A:{dayData.absent}
                        </span>
                      )}
                      {dayData.isHoliday && (
                        <span className="text-[8px] font-semibold tracking-wide uppercase text-amber-600">H</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 5. Student Attendance Summary Table (Session-wide) */}
          <Card className="border border-slate-200/80 shadow-md bg-white rounded-xl">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg font-bold text-slate-800">Session Attendance Summary</CardTitle>
              <CardDescription className="text-slate-500">Academic session aggregates calculated automatically (working days only)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 uppercase text-xs font-semibold border-b">
                    <tr>
                      <th className="px-6 py-4">Student Name</th>
                      <th className="px-6 py-4">Roll No</th>
                      <th className="px-6 py-4 text-center">Days Present</th>
                      <th className="px-6 py-4 text-center">Days Absent</th>
                      <th className="px-6 py-4 text-center">Days Leave</th>
                      <th className="px-6 py-4 text-center">Total Working Days</th>
                      <th className="px-6 py-4 text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentSummaries.map((summary) => (
                      <tr key={summary.studentId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800">
                          {summary.studentName}{" "}
                          <span className="text-xs font-mono font-medium text-slate-400">({summary.admissionNo})</span>
                        </td>
                        <td className="px-6 py-4 font-mono font-medium text-slate-600">{summary.rollNo}</td>
                        <td className="px-6 py-4 text-center font-bold text-emerald-600">{summary.present}</td>
                        <td className="px-6 py-4 text-center font-bold text-rose-600">{summary.absent}</td>
                        <td className="px-6 py-4 text-center font-bold text-blue-500">{summary.leave}</td>
                        <td className="px-6 py-4 text-center font-bold text-slate-700">{summary.totalDays}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={cn(
                            "font-bold font-mono px-2 py-0.5 rounded text-xs",
                            summary.percentage >= 75
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : summary.percentage >= 50
                                ? "bg-amber-50 text-amber-700 border border-amber-100"
                                : "bg-rose-50 text-rose-700 border border-rose-100"
                          )}>
                            {summary.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

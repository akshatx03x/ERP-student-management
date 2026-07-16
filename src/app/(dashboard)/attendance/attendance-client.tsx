"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  listAttendanceAction,
  markAttendanceAction,
  monthlyAttendanceAction,
} from "@/server/actions/ops.actions";

type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };
type Session = { id: string; name: string };

export function AttendanceClient({
  classes,
  sessions,
  currentSessionId,
}: {
  classes: ClassRow[];
  sessions: Session[];
  currentSessionId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [sessionId, setSessionId] = useState(currentSessionId ?? sessions[0]?.id ?? "");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const sections = useMemo(() => classes.find((c) => c.id === classId)?.sections ?? [], [classes, classId]);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Array<{ studentId: string; fullName: string; status: string }>>([]);
  const [summary, setSummary] = useState<unknown>(null);

  function load() {
    startTransition(async () => {
      try {
        const data = await listAttendanceAction({
          sessionId,
          sectionId,
          date: new Date(date),
        });
        setRows(
          data.map((r) => ({
            studentId: r.student.id,
            fullName: r.student.fullName,
            status: r.attendance?.status ?? "PRESENT",
          })),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Daily attendance</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
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
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={load}>Load roster</Button>
            <Button
              type="button"
              disabled={pending || rows.length === 0}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await markAttendanceAction({
                      sessionId,
                      sectionId,
                      date: new Date(date),
                      records: rows.map((r) => ({
                        studentId: r.studentId,
                        status: r.status as "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "EXCUSED",
                      })),
                    });
                    toast.success("Attendance saved");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                })
              }
            >
              Save
            </Button>
          </div>
          <div className="space-y-2">
            {rows.map((r, idx) => (
              <div key={r.studentId} className="flex items-center justify-between rounded-lg border p-3 text-sm bg-card hover:bg-stone-50">
                <span className="font-medium text-stone-700">{r.fullName}</span>
                <div className="flex flex-wrap gap-1">
                  {["PRESENT", "ABSENT", "LATE", "EXCUSED"].map((st) => {
                    const active = r.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          setRows((all) => all.map((x, i) => (i === idx ? { ...x, status: st } : x)))
                        }
                        className={cn(
                          "rounded-md px-3 py-1 text-xs font-semibold border transition-all select-none",
                          active
                            ? st === "PRESENT"
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : st === "ABSENT"
                                ? "bg-rose-600 border-rose-600 text-white"
                                : st === "LATE"
                                  ? "bg-amber-500 border-amber-500 text-white"
                                  : "bg-blue-500 border-blue-500 text-white"
                            : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                        )}
                      >
                        {st === "PRESENT" ? "Present" : st === "ABSENT" ? "Absent" : st === "LATE" ? "Late" : "Excused"}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Monthly summary</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending || !sectionId}
            onClick={() =>
              startTransition(async () => {
                try {
                  const d = new Date(date);
                  const result = await monthlyAttendanceAction({
                    sessionId,
                    sectionId,
                    month: d.getMonth() + 1,
                    year: d.getFullYear(),
                  });
                  setSummary(result);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              })
            }
          >
            Load month for selected section
          </Button>
          {summary ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 border-b text-left">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold text-stone-600">Student Name (Admn No)</th>
                    <th className="px-4 py-2.5 font-semibold text-stone-600 text-center">Present</th>
                    <th className="px-4 py-2.5 font-semibold text-stone-600 text-center">Absent</th>
                    <th className="px-4 py-2.5 font-semibold text-stone-600 text-center">Late</th>
                    <th className="px-4 py-2.5 font-semibold text-stone-600 text-center">Excused</th>
                    <th className="px-4 py-2.5 font-semibold text-stone-600 text-right">Attendance %</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary as any).summaries.map((s: any) => (
                    <tr key={s.studentId} className="border-b last:border-0 hover:bg-stone-50/50">
                      <td className="px-4 py-2.5 font-medium text-stone-700">
                        {s.studentName} <span className="text-xs text-muted-foreground font-mono">({s.admissionNo})</span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-emerald-600 font-semibold">{s.present}</td>
                      <td className="px-4 py-2.5 text-center text-rose-600 font-semibold">{s.absent}</td>
                      <td className="px-4 py-2.5 text-center text-amber-500 font-semibold">{s.late}</td>
                      <td className="px-4 py-2.5 text-center text-blue-500 font-semibold">{s.excused}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">
                        <span className={cn(
                          s.percentage >= 75 ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {s.percentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

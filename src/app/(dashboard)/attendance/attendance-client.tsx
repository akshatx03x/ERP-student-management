"use client";

import { useMemo, useState, useTransition } from "react";
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
              <div key={r.studentId} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <span>{r.fullName}</span>
                <Select
                  value={r.status}
                  onChange={(e) =>
                    setRows((all) => all.map((x, i) => (i === idx ? { ...x, status: e.target.value } : x)))
                  }
                  className="w-40"
                >
                  <option value="PRESENT">Present</option>
                  <option value="ABSENT">Absent</option>
                  <option value="LATE">Late</option>
                  <option value="HALF_DAY">Half day</option>
                  <option value="EXCUSED">Excused</option>
                </Select>
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
            <pre className="max-h-64 overflow-auto rounded border bg-muted/30 p-3 text-xs">
              {JSON.stringify(summary, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createTimetableSlotAction,
  deleteTimetableSlotAction,
  getTimetableAction,
} from "@/server/actions/ops.actions";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };
type Subject = { id: string; name: string };
type Teacher = { id: string; fullName: string };
type Session = { id: string; name: string };
type Slot = {
  id: string;
  dayOfWeek: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: { name: string };
  staffProfile: { fullName: string };
};

export function TimetableClient(props: {
  classes: ClassRow[];
  subjects: Subject[];
  teachers: Teacher[];
  sessions: Session[];
  currentSessionId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [sessionId, setSessionId] = useState(props.currentSessionId ?? props.sessions[0]?.id ?? "");
  const [classId, setClassId] = useState(props.classes[0]?.id ?? "");
  const sections = useMemo(() => props.classes.find((c) => c.id === classId)?.sections ?? [], [props.classes, classId]);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [form, setForm] = useState({
    dayOfWeek: "MONDAY",
    periodNumber: "1",
    startTime: "09:00",
    endTime: "09:45",
    subjectId: props.subjects[0]?.id ?? "",
    staffProfileId: props.teachers[0]?.id ?? "",
  });

  function load() {
    startTransition(async () => {
      try {
        const data = await getTimetableAction({ sessionId, sectionId });
        setSlots(data as Slot[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>View / manage</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {props.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={classId} onChange={(e) => {
              setClassId(e.target.value);
              setSectionId(props.classes.find((c) => c.id === e.target.value)?.sections[0]?.id ?? "");
            }}>
              {props.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Button type="button" variant="outline" disabled={pending} onClick={load}>Load</Button>
          </div>

          <div className="grid gap-2 md:grid-cols-6">
            <Select value={form.dayOfWeek} onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: e.target.value }))}>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Input value={form.periodNumber} onChange={(e) => setForm((f) => ({ ...f, periodNumber: e.target.value }))} placeholder="Period" />
            <Input value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} placeholder="HH:MM" />
            <Input value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} placeholder="HH:MM" />
            <Select value={form.subjectId} onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}>
              {props.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={form.staffProfileId} onChange={(e) => setForm((f) => ({ ...f, staffProfileId: e.target.value }))}>
              {props.teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
            </Select>
          </div>
          <Button
            disabled={pending || !sectionId || !form.subjectId || !form.staffProfileId}
            onClick={() =>
              startTransition(async () => {
                try {
                  await createTimetableSlotAction({
                    sessionId,
                    sectionId,
                    dayOfWeek: form.dayOfWeek as (typeof DAYS)[number],
                    periodNumber: Number(form.periodNumber),
                    startTime: form.startTime,
                    endTime: form.endTime,
                    subjectId: form.subjectId,
                    staffProfileId: form.staffProfileId,
                  });
                  toast.success("Slot added");
                  load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              })
            }
          >
            Add slot
          </Button>
        </CardContent>
      </Card>

      {slots.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Schedule Matrix</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[800px] border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="p-3 border-r font-semibold text-stone-600 text-left w-24">Day</th>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                    <th key={p} className="p-3 border-r font-semibold text-stone-600 text-center">
                      Period {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day} className="border-b last:border-0 hover:bg-stone-50/40">
                    <td className="p-3 border-r font-bold bg-stone-50 text-stone-700 uppercase tracking-wider">{day.slice(0, 3)}</td>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((period) => {
                      const slot = slots.find((s) => s.dayOfWeek === day && s.periodNumber === period);
                      return (
                        <td key={period} className="p-3 border-r text-center align-top relative min-h-[90px]">
                          {slot ? (
                            <div className="space-y-1">
                              <p className="font-semibold text-stone-900">{slot.subject.name}</p>
                              <p className="text-[10px] text-stone-500">{slot.staffProfile.fullName}</p>
                              <p className="text-[9px] font-mono text-stone-400">{slot.startTime} - {slot.endTime}</p>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  startTransition(async () => {
                                    try {
                                      await deleteTimetableSlotAction(slot.id);
                                      toast.success("Deleted");
                                      load();
                                    } catch (e) {
                                      toast.error(e instanceof Error ? e.message : "Failed");
                                    }
                                  })
                                }
                                className="mt-1.5 text-[10px] text-rose-500 hover:text-rose-700 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, dayOfWeek: day, periodNumber: String(period) }))}
                              className="text-[10px] text-stone-400 hover:text-primary transition-colors py-4 w-full h-full block"
                            >
                              + Add
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No schedule slots found. Select section and click Load to view or add slots.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

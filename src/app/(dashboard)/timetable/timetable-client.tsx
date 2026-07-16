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

      <div className="space-y-2">
        {slots.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
            <span>
              {s.dayOfWeek} P{s.periodNumber} · {s.startTime}-{s.endTime} · {s.subject.name} · {s.staffProfile.fullName}
            </span>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => {
              try {
                await deleteTimetableSlotAction(s.id);
                toast.success("Deleted");
                load();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            })}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

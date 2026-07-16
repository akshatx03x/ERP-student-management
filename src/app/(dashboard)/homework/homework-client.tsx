"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createHomeworkAction, deleteHomeworkAction } from "@/server/actions/platform.actions";
import { formatDate } from "@/lib/utils";

type HW = {
  id: string;
  title: string;
  dueDate: Date | string;
  description: string | null;
  subject: { name: string };
  section: { name: string; class: { name: string } };
};
type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };
type Subject = { id: string; name: string };
type Session = { id: string; name: string };

export function HomeworkClient(props: {
  homework: HW[];
  classes: ClassRow[];
  subjects: Subject[];
  sessions: Session[];
  currentSessionId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [classId, setClassId] = useState(props.classes[0]?.id ?? "");
  const sections = useMemo(() => props.classes.find((c) => c.id === classId)?.sections ?? [], [props.classes, classId]);
  const [form, setForm] = useState({
    sessionId: props.currentSessionId ?? props.sessions[0]?.id ?? "",
    sectionId: sections[0]?.id ?? "",
    subjectId: props.subjects[0]?.id ?? "",
    title: "",
    description: "",
    dueDate: "",
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Assign homework</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Select value={form.sessionId} onChange={(e) => setForm((f) => ({ ...f, sessionId: e.target.value }))}>
            {props.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={classId} onChange={(e) => {
            setClassId(e.target.value);
            const next = props.classes.find((c) => c.id === e.target.value)?.sections[0]?.id ?? "";
            setForm((f) => ({ ...f, sectionId: next }));
          }}>
            {props.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={form.sectionId} onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value }))}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={form.subjectId} onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}>
            {props.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
          <Textarea className="md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Button disabled={pending || !form.title || !form.dueDate} onClick={() => startTransition(async () => {
            try {
              await createHomeworkAction({
                sessionId: form.sessionId,
                sectionId: form.sectionId,
                subjectId: form.subjectId,
                title: form.title,
                description: form.description || null,
                dueDate: new Date(form.dueDate),
              });
              toast.success("Homework created");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed — teachers need a staff profile");
            }
          })}>Create</Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {props.homework.map((h) => (
          <div key={h.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="font-medium">{h.title}</p>
              <p className="text-sm text-muted-foreground">
                {h.section.class.name}-{h.section.name} · {h.subject.name} · Due {formatDate(h.dueDate)}
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
              try {
                await deleteHomeworkAction(h.id);
                toast.success("Deleted");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            })}>Delete</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

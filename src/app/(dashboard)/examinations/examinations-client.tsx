"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createExamTypeAction,
  createExamAction,
  createExamSubjectAction,
  enterMarksAction,
  generateReportCardAction,
  getExamAction,
} from "@/server/actions/platform.actions";

type Session = { id: string; name: string };
type ClassRow = { id: string; name: string };
type Subject = { id: string; name: string };
type Student = { id: string; fullName: string };
type ExamType = { id: string; name: string };
type Exam = { id: string; name: string; class: { name: string }; examType: { name: string } };

export function ExaminationsClient(props: {
  sessions: Session[];
  currentSessionId: string | null;
  classes: ClassRow[];
  subjects: Subject[];
  students: Student[];
  exams: Exam[];
  examTypes: ExamType[];
}) {
  const [pending, startTransition] = useTransition();
  const [sessionId, setSessionId] = useState(props.currentSessionId ?? "");
  const [typeName, setTypeName] = useState("");
  const [examForm, setExamForm] = useState({
    examTypeId: props.examTypes[0]?.id ?? "",
    classId: props.classes[0]?.id ?? "",
    name: "",
  });
  const [subjectForm, setSubjectForm] = useState({
    examId: props.exams[0]?.id ?? "",
    subjectId: props.subjects[0]?.id ?? "",
    maxMarks: "100",
    passMarks: "33",
  });
  const [marksExamId, setMarksExamId] = useState(props.exams[0]?.id ?? "");
  const [examSubjects, setExamSubjects] = useState<Array<{ id: string; subject: { name: string } }>>([]);
  const [selectedExamSubjectId, setSelectedExamSubjectId] = useState("");
  const [markRows, setMarkRows] = useState<Array<{ studentId: string; fullName: string; marks: string }>>([]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Exam type</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {props.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="Mid Term" />
            <Button disabled={pending || !sessionId || !typeName} onClick={() => startTransition(async () => {
              try {
                await createExamTypeAction({ sessionId, name: typeName });
                toast.success("Exam type created");
                setTypeName("");
              } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            })}>Create type</Button>
            <div className="text-sm space-y-1">
              {props.examTypes.map((t) => <div key={t.id} className="rounded border px-2 py-1">{t.name}</div>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Create exam</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={examForm.examTypeId} onChange={(e) => setExamForm((f) => ({ ...f, examTypeId: e.target.value }))}>
              {props.examTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select value={examForm.classId} onChange={(e) => setExamForm((f) => ({ ...f, classId: e.target.value }))}>
              {props.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input value={examForm.name} onChange={(e) => setExamForm((f) => ({ ...f, name: e.target.value }))} placeholder="Class 5 Mid Term" />
            <Button disabled={pending || !examForm.name || !sessionId} onClick={() => startTransition(async () => {
              try {
                await createExamAction({ sessionId, ...examForm });
                toast.success("Exam created");
              } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            })}>Create exam</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Add exam subject</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={subjectForm.examId} onChange={(e) => setSubjectForm((f) => ({ ...f, examId: e.target.value }))}>
              {props.exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
            <Select value={subjectForm.subjectId} onChange={(e) => setSubjectForm((f) => ({ ...f, subjectId: e.target.value }))}>
              {props.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input value={subjectForm.maxMarks} onChange={(e) => setSubjectForm((f) => ({ ...f, maxMarks: e.target.value }))} placeholder="Max" />
            <Input value={subjectForm.passMarks} onChange={(e) => setSubjectForm((f) => ({ ...f, passMarks: e.target.value }))} placeholder="Pass" />
            <Button disabled={pending || !subjectForm.examId} onClick={() => startTransition(async () => {
              try {
                await createExamSubjectAction({
                  examId: subjectForm.examId,
                  subjectId: subjectForm.subjectId,
                  maxMarks: Number(subjectForm.maxMarks),
                  passMarks: Number(subjectForm.passMarks),
                });
                toast.success("Subject linked");
              } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            })}>Add subject</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Marks entry</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={marksExamId} onChange={(e) => setMarksExamId(e.target.value)}>
              {props.exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
            <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
              try {
                const exam = await getExamAction(marksExamId);
                setExamSubjects(exam.subjects.map((s: { id: string; subject: { name: string } }) => ({ id: s.id, subject: s.subject })));
                setSelectedExamSubjectId(exam.subjects[0]?.id ?? "");
                setMarkRows(props.students.map((s) => ({ studentId: s.id, fullName: s.fullName, marks: "" })));
              } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            })}>Load exam</Button>
            <Select value={selectedExamSubjectId} onChange={(e) => setSelectedExamSubjectId(e.target.value)}>
              {examSubjects.map((s) => <option key={s.id} value={s.id}>{s.subject.name}</option>)}
            </Select>
            <Button disabled={pending || !selectedExamSubjectId} onClick={() => startTransition(async () => {
              try {
                await enterMarksAction({
                  examSubjectId: selectedExamSubjectId,
                  entries: markRows
                    .filter((r) => r.marks !== "")
                    .map((r) => ({ studentId: r.studentId, marksObtained: Number(r.marks) })),
                });
                toast.success("Marks saved");
              } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            })}>Save marks</Button>
          </div>
          <div className="max-h-64 space-y-1 overflow-auto">
            {markRows.map((r, idx) => (
              <div key={r.studentId} className="flex items-center justify-between gap-2 text-sm">
                <span>{r.fullName}</span>
                <Input className="w-24" value={r.marks} onChange={(e) => setMarkRows((rows) => rows.map((x, i) => i === idx ? { ...x, marks: e.target.value } : x))} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Report card</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select id="rc-student" defaultValue={props.students[0]?.id}>
            {props.students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </Select>
          <Button disabled={pending || !sessionId} onClick={() => startTransition(async () => {
            try {
              const select = document.getElementById("rc-student") as HTMLSelectElement;
              await generateReportCardAction({
                studentId: select.value,
                sessionId,
                examId: marksExamId || null,
              });
              toast.success("Report card generated");
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          })}>Generate</Button>
        </CardContent>
      </Card>

      <div className="space-y-2 text-sm">
        {props.exams.map((e) => (
          <div key={e.id} className="rounded border px-3 py-2">{e.name} · {e.examType.name} · {e.class.name}</div>
        ))}
      </div>
    </div>
  );
}

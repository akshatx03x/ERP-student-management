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

type ReportCardSubject = {
  subject: string;
  exam: string;
  examType: string;
  marksObtained: number;
  maxMarks: number;
  grade: string | null;
  passMarks: number;
  passed: boolean;
};

type ReportCardSnapshot = {
  student?: {
    id?: string;
    fullName?: string;
    admissionNo?: string;
    class?: string;
    section?: string;
    rollNo?: number | null;
  };
  session?: string;
  branding?: {
    schoolName?: string;
    address?: string | null;
    reportCardFooter?: string | null;
    logoDocumentId?: string | null;
  } | null;
  subjects?: ReportCardSubject[];
  summary?: {
    totalObtained?: number;
    totalMax?: number;
    overallPercent?: number;
    overallGrade?: string | null;
  };
  generatedAt?: string;
  generatedBy?: string;
};

type ReportCard = {
  id: string;
  studentId: string;
  sessionId: string;
  examId: string | null;
  snapshot: ReportCardSnapshot;
  publishedAt: Date | string;
};

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
  const [selectedReportCard, setSelectedReportCard] = useState<ReportCard | null>(null);
  const [batchReportCards, setBatchReportCards] = useState<ReportCard[]>([]);

  const handleBatchGenerate = () => {
    if (!sessionId) {
      toast.error("Academic session is required");
      return;
    }
    if (props.students.length === 0) {
      toast.error("No students found to generate report cards for");
      return;
    }
    startTransition(async () => {
      const generated = [];
      let count = 0;
      for (const s of props.students) {
        try {
          const card = (await generateReportCardAction({
            studentId: s.id,
            sessionId,
            examId: marksExamId || null,
          })) as unknown as ReportCard;
          generated.push(card);
          count++;
        } catch (e) {
          console.error(e);
        }
      }
      setBatchReportCards(generated);
      toast.success(`Generated ${count} report cards successfully.`);
    });
  };
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
        <CardHeader>
          <CardTitle>Report Cards & Grading</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select id="rc-student" defaultValue={props.students[0]?.id} className="max-w-xs">
              {props.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </Select>
            <Button
              disabled={pending || !sessionId}
              onClick={() =>
                startTransition(async () => {
                  try {
                    const select = document.getElementById("rc-student") as HTMLSelectElement;
                    const card = (await generateReportCardAction({
                      studentId: select.value,
                      sessionId,
                      examId: marksExamId || null,
                    })) as unknown as ReportCard;
                    setSelectedReportCard(card);
                    toast.success("Report card generated");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                })
              }
            >
              Generate & View
            </Button>
            <Button
              variant="outline"
              disabled={pending || !sessionId}
              onClick={handleBatchGenerate}
            >
              Batch Generate Class
            </Button>
          </div>

          {selectedReportCard && (
            <div className="border rounded-lg p-4 bg-stone-50 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Report card generated for {selectedReportCard.snapshot?.student?.fullName || "student"}</span>
                <Button size="sm" onClick={() => window.print()}>
                  Print Report Card
                </Button>
              </div>
              <div className="bg-white border rounded p-4 shadow-inner max-h-96 overflow-auto">
                <ReportCardPreview card={selectedReportCard} />
              </div>
            </div>
          )}

          {batchReportCards.length > 0 && (
            <div className="border rounded-lg p-4 bg-stone-50 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Batch generated {batchReportCards.length} report cards</span>
                <Button size="sm" onClick={() => window.print()}>
                  Print All Class Cards
                </Button>
              </div>
              <div className="space-y-4 max-h-96 overflow-auto p-2 bg-stone-200 rounded border">
                {batchReportCards.map((card, idx) => (
                  <div key={idx} className="bg-white p-4 rounded border shadow-sm">
                    <ReportCardPreview card={card} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2 text-sm">
        <h3 className="font-semibold text-stone-700">Scheduled Examinations</h3>
        {props.exams.map((e) => (
          <div key={e.id} className="rounded border bg-card px-3 py-2">
            {e.name} · {e.examType.name} · {e.class.name}
          </div>
        ))}
      </div>

      {/* Printable Report Cards (Only shown during printing) */}
      <div className="print-only">
        {selectedReportCard ? (
          <ReportCardPreview card={selectedReportCard} />
        ) : batchReportCards.length > 0 ? (
          batchReportCards.map((card, idx) => (
            <div key={idx} style={{ pageBreakAfter: "always" }}>
              <ReportCardPreview card={card} />
            </div>
          ))
        ) : null}
      </div>
    </div>
  );
}

function ReportCardPreview({ card }: { card: ReportCard | ReportCardSnapshot | null }) {
  if (!card) return null;
  const snap = (card && "snapshot" in card && card.snapshot) ? card.snapshot : (card as ReportCardSnapshot);
  return (
    <div className="bg-white p-8 text-black border border-stone-200 rounded-md font-sans max-w-2xl mx-auto shadow-sm my-4 break-inside-avoid">
      {/* Header */}
      <div className="text-center border-b pb-4 mb-4">
        {snap.branding?.logoDocumentId && (
          <img
            src={`/api/documents/${snap.branding.logoDocumentId}`}
            className="mx-auto h-16 w-auto object-contain mb-3"
            alt="School Logo"
          />
        )}
        <h1 className="text-xl font-bold tracking-wide uppercase text-stone-800">
          {snap.branding?.schoolName || "Vidhyanjali Public School"}
        </h1>
        {snap.branding?.address && (
          <p className="text-xs text-stone-500">{snap.branding.address}</p>
        )}
        <div className="mt-2 inline-block border border-stone-800 px-4 py-1 text-xs font-bold uppercase tracking-wider">
          Student Progress Report (Session {snap.session})
        </div>
      </div>

      {/* Student Details */}
      <div className="grid grid-cols-2 gap-4 text-xs mb-6 border-b pb-4">
        <div className="space-y-1">
          <p><span className="text-stone-500 font-medium">Student Name:</span> <span className="font-bold text-stone-900">{snap.student?.fullName}</span></p>
          <p><span className="text-stone-500 font-medium">Admission No:</span> <span className="font-mono">{snap.student?.admissionNo}</span></p>
          <p><span className="text-stone-500 font-medium">Roll No:</span> <span>{snap.student?.rollNo ?? "—"}</span></p>
        </div>
        <div className="text-right space-y-1">
          <p><span className="text-stone-500 font-medium">Class:</span> <span className="font-semibold">{snap.student?.class}</span></p>
          <p><span className="text-stone-500 font-medium">Section:</span> <span className="font-semibold">{snap.student?.section}</span></p>
        </div>
      </div>

      {/* Marks Table */}
      <table className="w-full text-xs border-collapse mb-6">
        <thead>
          <tr className="border-b border-stone-800 bg-stone-50 text-left font-bold text-stone-700">
            <th className="py-2 px-3">Subject / Exam</th>
            <th className="py-2 px-3 text-center">Max Marks</th>
            <th className="py-2 px-3 text-center">Pass Marks</th>
            <th className="py-2 px-3 text-center">Marks Obtained</th>
            <th className="py-2 px-3 text-center">Grade</th>
            <th className="py-2 px-3 text-right">Result</th>
          </tr>
        </thead>
        <tbody>
          {(snap.subjects || []).map((sub: ReportCardSubject, idx: number) => (
            <tr key={idx} className="border-b border-stone-200">
              <td className="py-2 px-3">
                <span className="font-semibold text-stone-800">{sub.subject}</span>
                <span className="text-[10px] text-stone-400 block">{sub.exam} ({sub.examType})</span>
              </td>
              <td className="py-2 px-3 text-center font-mono">{sub.maxMarks}</td>
              <td className="py-2 px-3 text-center font-mono text-stone-600">{sub.passMarks}</td>
              <td className="py-2 px-3 text-center font-mono font-bold text-stone-900">{sub.marksObtained}</td>
              <td className="py-2 px-3 text-center font-semibold text-stone-800">{sub.grade || "—"}</td>
              <td className="py-2 px-3 text-right">
                <span className={sub.passed ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                  {sub.passed ? "Pass" : "Fail"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary Matrix */}
      <div className="grid grid-cols-3 gap-2 border border-stone-300 rounded p-3 text-center text-xs mb-6">
        <div>
          <p className="text-stone-500 mb-0.5">Total Marks</p>
          <p className="font-bold text-sm font-mono">{snap.summary?.totalObtained} / {snap.summary?.totalMax}</p>
        </div>
        <div>
          <p className="text-stone-500 mb-0.5">Percentage</p>
          <p className="font-bold text-sm font-mono">{snap.summary?.overallPercent}%</p>
        </div>
        <div>
          <p className="text-stone-500 mb-0.5">Overall Grade</p>
          <p className="font-bold text-sm text-stone-800">{snap.summary?.overallGrade || "—"}</p>
        </div>
      </div>

      {/* Signatures */}
      <div className="mt-12 grid grid-cols-2 gap-4 text-center text-[10px] text-stone-400">
        <div className="pt-8 border-t border-dashed border-stone-200">
          <p className="h-4"></p>
          <p>Class Teacher Signature</p>
        </div>
        <div className="pt-8 border-t border-dashed border-stone-200">
          <p className="h-4"></p>
          <p>Principal Signature</p>
        </div>
      </div>

      {/* Footer */}
      {snap.branding?.reportCardFooter && (
        <div className="text-center mt-8 pt-4 border-t border-stone-100 text-[10px] text-stone-400">
          <p>{snap.branding.reportCardFooter}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useTransition, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Search, Plus, BookOpen, Settings, Layout, Edit, Ban, Loader2, Save,
  CheckCircle, ShieldAlert, FileText, ChevronRight, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getClassResultsOverviewAction,
  getStudentMarksDataAction,
  saveStudentMarksAction,
  listClassSubjectsAction,
  assignClassSubjectsAction,
  listClassExamsAction,
  createClassExamAction,
  updateClassExamAction,
  deleteClassExamAction,
  createGlobalSubjectAction,
  updateGlobalSubjectAction,
  deleteGlobalSubjectAction,
} from "@/server/actions/result.actions";
import { SubjectType, ExamPublishStatus, ResultOutcome, ResultStatus } from "@prisma/client";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────
type Session = { id: string; name: string; isCurrent: boolean };
type ClassItem = { id: string; name: string; sections: { id: string; name: string }[] };
type GlobalSubject = { id: string; name: string; code: string; subjectType: SubjectType; displayOrder: number };
type ExamType = { id: string; name: string };

interface Props {
  sessions: Session[];
  classes: ClassItem[];
  globalSubjects: GlobalSubject[];
  examTypes: ExamType[];
  currentSessionId: string | null;
  userRole: string;
}

export function ResultsClient({ sessions, classes, globalSubjects, examTypes, currentSessionId, userRole }: Props) {
  const [isPending, startTransition] = useTransition();

  // Filter state
  const [sessionId, setSessionId] = useState(currentSessionId ?? "");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<any[]>([]);

  // Modals state
  const [showManageSubjects, setShowManageSubjects] = useState(false);
  const [showExamConfig, setShowExamConfig] = useState(false);
  const [showMarksEntry, setShowMarksEntry] = useState(false);

  // Marks Entry state
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [marksData, setMarksData] = useState<any>(null);
  const [editingMarks, setEditingMarks] = useState<Record<string, number>>({});
  const [editingTerm, setEditingTerm] = useState<any>({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);

  // Subject management state
  const [subjectsList, setSubjectsList] = useState<GlobalSubject[]>(globalSubjects);
  const [editingSubject, setEditingSubject] = useState<GlobalSubject | null>(null);
  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", type: "SCHOLASTIC" as SubjectType, order: 0 });
  const [classAssignments, setClassAssignments] = useState<Record<string, boolean>>({}); // subjectId -> selected
  const [classOptional, setClassOptional] = useState<Record<string, boolean>>({}); // subjectId -> optional

  // Exam Config State
  const [classExams, setClassExams] = useState<any[]>([]);
  const [editingExam, setEditingExam] = useState<any | null>(null);
  const [examForm, setExamForm] = useState({
    name: "",
    examTypeId: "",
    term: 1,
    displayOrder: 0,
    maxMarks: "",
    passMarks: "",
    publishStatus: "DRAFT" as ExamPublishStatus,
    visibilityStatus: true,
    subjects: [] as { subjectId: string; maxMarks: number; passMarks: number }[],
  });

  const sections = classes.find((c) => c.id === classId)?.sections ?? [];

  // Load Students
  useEffect(() => {
    if (classId && sectionId && sessionId) {
      loadStudents();
    } else {
      setStudents([]);
    }
  }, [classId, sectionId, sessionId, search]);

  const loadStudents = () => {
    startTransition(async () => {
      try {
        const data = await getClassResultsOverviewAction({ classId, sectionId, sessionId, search });
        setStudents(data);
      } catch (err: any) {
        toast.error(err.message || "Failed to load students");
      }
    });
  };

  // ── 1. Marks Entry Grid Recalculations ──────────────────────────────────────
  const handleMarkChange = (examSubjectId: string, val: string) => {
    const numVal = Math.min(100, Math.max(0, Number(val) || 0));
    setEditingMarks((prev) => ({ ...prev, [examSubjectId]: numVal }));
  };

  const getCalculatedTotals = () => {
    if (!marksData) return null;

    const term1Exams = marksData.exams.filter((e: any) => e.term === 1);
    const term2Exams = marksData.exams.filter((e: any) => e.term === 2);

    let finalGrandTotal = 0;
    let finalMaxPossible = 0;

    const subjectsSummary = marksData.subjects.map((sub: any) => {
      let t1Sum = 0;
      let t1Max = 0;
      let t2Sum = 0;
      let t2Max = 0;

      // Term 1 sum
      term1Exams.forEach((ex: any) => {
        const es = ex.subjects.find((s: any) => s.subjectId === sub.id);
        if (es) {
          const mark = editingMarks[es.examSubjectId] ?? 0;
          t1Sum += mark;
          t1Max += es.maxMarks;
        }
      });

      // Term 2 sum
      term2Exams.forEach((ex: any) => {
        const es = ex.subjects.find((s: any) => s.subjectId === sub.id);
        if (es) {
          const mark = editingMarks[es.examSubjectId] ?? 0;
          t2Sum += mark;
          t2Max += es.maxMarks;
        }
      });

      const subTotal = t1Sum + t2Sum;
      const subMax = t1Max + t2Max;

      if (sub.type === "SCHOLASTIC") {
        finalGrandTotal += subTotal;
        finalMaxPossible += subMax;
      }

      const percent = subMax > 0 ? (subTotal / subMax) * 100 : 0;
      let grade = "E";
      if (percent >= 90) grade = "A1";
      else if (percent >= 80) grade = "A2";
      else if (percent >= 70) grade = "B1";
      else if (percent >= 60) grade = "B2";
      else if (percent >= 50) grade = "C1";
      else if (percent >= 40) grade = "C2";
      else if (percent >= 33) grade = "D";

      return {
        id: sub.id,
        name: sub.name,
        code: sub.code,
        type: sub.type,
        t1Total: t1Sum,
        t1Max,
        t2Total: t2Sum,
        t2Max,
        total: subTotal,
        max: subMax,
        grade,
      };
    });

    const overallPercentage = finalMaxPossible > 0 ? (finalGrandTotal / finalMaxPossible) * 100 : 0;
    let finalGrade = "E";
    if (overallPercentage >= 90) finalGrade = "A1";
    else if (overallPercentage >= 80) finalGrade = "A2";
    else if (overallPercentage >= 70) finalGrade = "B1";
    else if (overallPercentage >= 60) finalGrade = "B2";
    else if (overallPercentage >= 50) finalGrade = "C1";
    else if (overallPercentage >= 40) finalGrade = "C2";
    else if (overallPercentage >= 33) finalGrade = "D";

    return {
      subjectsSummary,
      grandTotal: finalGrandTotal,
      maxPossible: finalMaxPossible,
      percentage: Math.round(overallPercentage * 100) / 100,
      finalGrade,
    };
  };

  const calc = getCalculatedTotals();

  // Load Single Student Marks Data
  const openMarksEntry = async (studentId: string) => {
    setActiveStudentId(studentId);
    setMarksLoading(true);
    setShowMarksEntry(true);
    try {
      const data = await getStudentMarksDataAction(studentId, sessionId);
      setMarksData(data);

      // Load into local state
      const initialMarks: Record<string, number> = {};
      data.markEntries.forEach((m: any) => {
        initialMarks[m.examSubjectId] = m.marksObtained;
      });
      setEditingMarks(initialMarks);

      setEditingTerm({
        workingDays: data.termResult?.workingDays ?? "",
        presentDays: data.termResult?.presentDays ?? "",
        remarksMid: data.termResult?.remarksMid ?? "",
        remarksFinal: data.termResult?.remarksFinal ?? "",
        resultOutcome: data.termResult?.resultOutcome ?? "PASS",
        status: data.termResult?.status ?? "DRAFT",
      });
    } catch (err: any) {
      toast.error("Failed to load marks details");
      setShowMarksEntry(false);
    } finally {
      setMarksLoading(false);
    }
  };

  const saveMarks = async () => {
    if (!activeStudentId) return;
    setMarksSaving(true);

    const payloadMarks = Object.entries(editingMarks).map(([examSubjectId, val]) => ({
      examSubjectId,
      marksObtained: Number(val),
    }));

    try {
      await saveStudentMarksAction({
        studentId: activeStudentId,
        sessionId,
        marks: payloadMarks,
        termDetail: {
          workingDays: editingTerm.workingDays ? Number(editingTerm.workingDays) : null,
          presentDays: editingTerm.presentDays ? Number(editingTerm.presentDays) : null,
          remarksMid: editingTerm.remarksMid || null,
          remarksFinal: editingTerm.remarksFinal || null,
          resultOutcome: editingTerm.resultOutcome as ResultOutcome,
          status: editingTerm.status as ResultStatus,
        },
      });
      toast.success("Marks saved successfully");
      setShowMarksEntry(false);
      loadStudents();
    } catch (err: any) {
      toast.error(err.message || "Failed to save marks");
    } finally {
      setMarksSaving(false);
    }
  };

  // ── 2. Subjects Management CRUD ─────────────────────────────────────────────
  const openManageSubjects = async () => {
    setShowManageSubjects(true);
    if (classId && sessionId) {
      const assigned = await listClassSubjectsAction(classId, sessionId);
      const activeMap: Record<string, boolean> = {};
      const optionalMap: Record<string, boolean> = {};
      assigned.forEach((a: any) => {
        activeMap[a.subjectId] = true;
        optionalMap[a.subjectId] = a.isOptional;
      });
      setClassAssignments(activeMap);
      setClassOptional(optionalMap);
    }
  };

  const handleSaveSubject = async () => {
    if (!subjectForm.name.trim() || !subjectForm.code.trim()) return;
    try {
      const payload = {
        name: subjectForm.name,
        code: subjectForm.code,
        subjectType: subjectForm.type,
        displayOrder: subjectForm.order,
      };
      if (editingSubject) {
        const updated = await updateGlobalSubjectAction(editingSubject.id, payload);
        setSubjectsList(prev => prev.map(s => s.id === editingSubject.id ? updated : s));
        toast.success("Subject updated");
      } else {
        const created = await createGlobalSubjectAction(payload);
        setSubjectsList(prev => [...prev, created]);
        toast.success("Subject created");
      }
      setSubjectForm({ name: "", code: "", type: "SCHOLASTIC", order: 0 });
      setEditingSubject(null);
    } catch (err: any) {
      toast.error(err.message || "Error saving subject");
    }
  };

  const handleSaveAssignments = async () => {
    if (!classId || !sessionId) return;
    const assignments = Object.entries(classAssignments)
      .filter(([_, active]) => active)
      .map(([subjectId]) => ({
        subjectId,
        isOptional: !!classOptional[subjectId],
      }));

    try {
      await assignClassSubjectsAction(classId, sessionId, assignments);
      toast.success("Class subjects updated successfully");
      setShowManageSubjects(false);
    } catch (err: any) {
      toast.error(err.message || "Error saving assignments");
    }
  };

  // ── 3. Exam Config CRUD ─────────────────────────────────────────────────────
  const openExamConfig = async () => {
    setShowExamConfig(true);
    if (classId && sessionId) {
      const exams = await listClassExamsAction(classId, sessionId);
      setClassExams(exams);
    }
  };

  const handleSaveExam = async () => {
    if (!examForm.name.trim() || !examForm.examTypeId) return;
    try {
      if (editingExam) {
        await updateClassExamAction(editingExam.id, {
          ...examForm,
          maxMarks: examForm.maxMarks ? Number(examForm.maxMarks) : null,
          passMarks: examForm.passMarks ? Number(examForm.passMarks) : null,
        });
        toast.success("Exam updated");
      } else {
        await createClassExamAction({
          ...examForm,
          classId,
          sessionId,
          maxMarks: examForm.maxMarks ? Number(examForm.maxMarks) : null,
          passMarks: examForm.passMarks ? Number(examForm.passMarks) : null,
        });
        toast.success("Exam created");
      }
      setEditingExam(null);
      setExamForm({ name: "", examTypeId: "", term: 1, displayOrder: 0, maxMarks: "", passMarks: "", publishStatus: "DRAFT", visibilityStatus: true, subjects: [] });
      const exams = await listClassExamsAction(classId, sessionId);
      setClassExams(exams);
    } catch (err: any) {
      toast.error(err.message || "Error saving exam");
    }
  };

  // ── UI Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[calc(100vh-220px)] max-w-[1440px] mx-auto text-sm">

        {/* Header toolbar */}
        <div className="bg-stone-50 border-b border-stone-200 px-5 py-3 flex justify-between items-center shrink-0">
          <div className="flex gap-2 flex-wrap">
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white">
              <option value="">Select Session</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white">
              <option value="">Select Class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {classId && sections.length > 0 && (
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white">
                <option value="">Select Section</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openManageSubjects} className="h-8 text-xs font-bold border-stone-300">
              <BookOpen className="w-3.5 h-3.5 mr-1" /> Manage Subjects
            </Button>
            {classId && (
              <Button variant="outline" size="sm" onClick={openExamConfig} className="h-8 text-xs font-bold border-stone-300">
                <Settings className="w-3.5 h-3.5 mr-1" /> Exam Config
              </Button>
            )}
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="border-b border-stone-200 px-5 py-2.5 bg-stone-50/50 shrink-0 flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-stone-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, roll, parent..."
              className="pl-8 h-8 text-xs bg-white rounded-lg border-stone-300"
            />
          </div>
          {isPending && <Loader2 className="w-4 h-4 animate-spin text-stone-400 self-center" />}
        </div>

        {/* Students Table Area */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                <th className="py-3 px-6 w-32">Adm. No</th>
                <th className="py-3 px-6 w-24">Roll No</th>
                <th className="py-3 px-6">Student Name</th>
                <th className="py-3 px-6">Father Name</th>
                <th className="py-3 px-6 w-36">Result Status</th>
                <th className="py-3 px-6 w-36 text-center">Outcome</th>
                <th className="py-3 px-6 w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {students.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-stone-400">Select Session, Class, and Section to load students</td></tr>
              ) : (
                students.map((st) => (
                  <tr key={st.studentId} className="hover:bg-stone-50/40">
                    <td className="py-3 px-6 font-mono font-bold text-stone-600">{st.admissionNo}</td>
                    <td className="py-3 px-6 font-mono text-stone-500">{st.rollNo}</td>
                    <td className="py-3 px-6 font-semibold text-stone-900">{st.fullName}</td>
                    <td className="py-3 px-6 text-stone-600">{st.fatherName}</td>
                    <td className="py-3 px-6">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border",
                        st.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : st.status === "LOCKED" ? "bg-stone-100 text-stone-700 border-stone-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                      )}>
                        {st.status}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-center">
                      {st.outcome ? (
                        <span className="font-bold text-[10px] uppercase text-indigo-700">{st.outcome}</span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-6 text-right">
                      <Button size="sm" onClick={() => openMarksEntry(st.studentId)} className="h-7 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg">
                        Enter Marks
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ MARKS ENTRY DIALOG (FULL SCREEN) ════════════════════════════════ */}
      {showMarksEntry && marksData && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-0 md:p-6 overflow-hidden">
          <div className="bg-white w-full h-full md:rounded-2xl max-w-6xl md:h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden">
            <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-stone-900 text-sm">{marksData.student.fullName}</h3>
                <p className="text-stone-500 text-xs mt-0.5">
                  Roll: {marksData.student.rollNo} · Class: {marksData.student.classSection} · Adm: {marksData.student.admissionNo}
                </p>
              </div>
              <button onClick={() => setShowMarksEntry(false)} className="text-stone-400 hover:text-stone-700 text-xl font-bold">×</button>
            </div>

            {/* Content Core */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {marksLoading ? (
                <div className="flex items-center justify-center h-48 text-stone-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading data…</div>
              ) : (
                <>
                  {/* Grid Table */}
                  <div className="border border-stone-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[9px]">
                          <th className="py-2.5 px-4 w-48">Subject</th>
                          {/* Term 1 Header */}
                          <th colSpan={marksData.exams.filter((e: any) => e.term === 1).length + 2} className="py-2.5 px-4 text-center bg-indigo-50/20 border-r border-stone-200 text-indigo-900">Term 1</th>
                          {/* Term 2 Header */}
                          <th colSpan={marksData.exams.filter((e: any) => e.term === 2).length + 2} className="py-2.5 px-4 text-center bg-emerald-50/20 border-r border-stone-200 text-emerald-900">Term 2</th>
                          {/* Final Summary Header */}
                          <th colSpan={3} className="py-2.5 px-4 text-center bg-violet-50/20 text-violet-900">Final</th>
                        </tr>
                        <tr className="bg-stone-50/50 border-b border-stone-200 text-[9px] font-bold">
                          <th className="py-2 px-4 border-r border-stone-200">Name (Code)</th>
                          {/* Term 1 Exams */}
                          {marksData.exams.filter((e: any) => e.term === 1).map((ex: any) => (
                            <th key={ex.id} className="py-2 px-2 text-center border-r border-stone-200 w-20">{ex.name}</th>
                          ))}
                          <th className="py-2 px-2 text-center bg-indigo-50/30 border-r border-stone-200 w-20">Total</th>
                          <th className="py-2 px-2 text-center bg-indigo-50/30 border-r border-stone-200 w-16">Grade</th>
                          {/* Term 2 Exams */}
                          {marksData.exams.filter((e: any) => e.term === 2).map((ex: any) => (
                            <th key={ex.id} className="py-2 px-2 text-center border-r border-stone-200 w-20">{ex.name}</th>
                          ))}
                          <th className="py-2 px-2 text-center bg-emerald-50/30 border-r border-stone-200 w-20">Total</th>
                          <th className="py-2 px-2 text-center bg-emerald-50/30 border-r border-stone-200 w-16">Grade</th>
                          {/* Final */}
                          <th className="py-2 px-2 text-center bg-violet-50/30 border-r border-stone-200 w-24">Grand Total</th>
                          <th className="py-2 px-2 text-center bg-violet-50/30 border-r border-stone-200 w-20">%</th>
                          <th className="py-2 px-2 text-center bg-violet-50/30 w-16">Grade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {calc?.subjectsSummary.map((sub: any) => (
                          <tr key={sub.id} className="hover:bg-stone-50/20">
                            <td className="py-2 px-4 border-r border-stone-200 font-semibold text-stone-700">
                              {sub.name} <span className="text-[10px] text-stone-400 font-mono">({sub.code})</span>
                            </td>
                            {/* Term 1 Input Cells */}
                            {marksData.exams.filter((e: any) => e.term === 1).map((ex: any) => {
                              const es = ex.subjects.find((s: any) => s.subjectId === sub.id);
                              if (!es) return <td key={ex.id} className="py-2 px-2 text-center border-r border-stone-200 bg-stone-50/30 text-stone-400">—</td>;
                              return (
                                <td key={ex.id} className="py-1 px-1 border-r border-stone-200">
                                  <input
                                    type="number"
                                    min="0"
                                    max={es.maxMarks}
                                    value={editingMarks[es.examSubjectId] ?? ""}
                                    onChange={(e) => handleMarkChange(es.examSubjectId, e.target.value)}
                                    className="w-full text-center h-7 border border-stone-200 rounded font-bold font-mono focus:border-indigo-500 focus:outline-none"
                                  />
                                </td>
                              );
                            })}
                            <td className="py-2 px-2 text-center font-mono font-bold bg-indigo-50/10 border-r border-stone-200 text-stone-850">{sub.t1Total} <span className="text-[9px] text-stone-400">/{sub.t1Max}</span></td>
                            <td className="py-2 px-2 text-center font-bold bg-indigo-50/10 border-r border-stone-200 text-indigo-700">{sub.t1Max > 0 ? sub.grade : "—"}</td>
                            {/* Term 2 Input Cells */}
                            {marksData.exams.filter((e: any) => e.term === 2).map((ex: any) => {
                              const es = ex.subjects.find((s: any) => s.subjectId === sub.id);
                              if (!es) return <td key={ex.id} className="py-2 px-2 text-center border-r border-stone-200 bg-stone-50/30 text-stone-400">—</td>;
                              return (
                                <td key={ex.id} className="py-1 px-1 border-r border-stone-200">
                                  <input
                                    type="number"
                                    min="0"
                                    max={es.maxMarks}
                                    value={editingMarks[es.examSubjectId] ?? ""}
                                    onChange={(e) => handleMarkChange(es.examSubjectId, e.target.value)}
                                    className="w-full text-center h-7 border border-stone-200 rounded font-bold font-mono focus:border-indigo-500 focus:outline-none"
                                  />
                                </td>
                              );
                            })}
                            <td className="py-2 px-2 text-center font-mono font-bold bg-emerald-50/10 border-r border-stone-200 text-stone-850">{sub.t2Total} <span className="text-[9px] text-stone-400">/{sub.t2Max}</span></td>
                            <td className="py-2 px-2 text-center font-bold bg-emerald-50/10 border-r border-stone-200 text-emerald-700">{sub.t2Max > 0 ? sub.grade : "—"}</td>
                            {/* Final */}
                            <td className="py-2 px-2 text-center font-mono font-bold bg-violet-50/10 border-r border-stone-200 text-stone-900">{sub.total} <span className="text-[9px] text-stone-450">/{sub.max}</span></td>
                            <td className="py-2 px-2 text-center font-mono font-bold bg-violet-50/10 border-r border-stone-200 text-stone-700">{sub.max > 0 ? `${Math.round((sub.total / sub.max) * 100)}%` : "—"}</td>
                            <td className="py-2 px-2 text-center font-bold bg-violet-50/10 text-violet-750">{sub.max > 0 ? sub.grade : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Calculations Details Summary Card */}
                  <div className="grid md:grid-cols-3 gap-6">
                    {/* Metrics Summary */}
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
                      <h4 className="font-bold text-xs text-stone-500 uppercase tracking-wider mb-2">Calculations Summary</h4>
                      <div className="flex justify-between font-mono text-xs"><span>Grand Total:</span><span className="font-bold">{calc?.grandTotal} / {calc?.maxPossible}</span></div>
                      <div className="flex justify-between font-mono text-xs"><span>Percentage:</span><span className="font-bold text-indigo-750">{calc?.percentage}%</span></div>
                      <div className="flex justify-between font-mono text-xs"><span>Final Grade:</span><span className="font-bold text-emerald-750">{calc?.finalGrade}</span></div>
                    </div>

                    {/* Attendance & Non-Subject Graded details */}
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3.5 text-xs">
                      <h4 className="font-bold text-xs text-stone-500 uppercase tracking-wider">Attendance & Details</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] font-bold text-stone-500">Working Days</Label>
                          <Input
                            type="number"
                            value={editingTerm.workingDays}
                            onChange={(e) => setEditingTerm((t: any) => ({ ...t, workingDays: e.target.value }))}
                            className="h-8 text-xs border-stone-300"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold text-stone-500">Present Days</Label>
                          <Input
                            type="number"
                            value={editingTerm.presentDays}
                            onChange={(e) => setEditingTerm((t: any) => ({ ...t, presentDays: e.target.value }))}
                            className="h-8 text-xs border-stone-300"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-stone-500">Outcome Status</Label>
                        <select
                          value={editingTerm.resultOutcome}
                          onChange={(e) => setEditingTerm((t: any) => ({ ...t, resultOutcome: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border border-stone-300 rounded-md bg-white text-stone-700"
                        >
                          <option value="PASS">PASS</option>
                          <option value="FAIL">FAIL</option>
                          <option value="PROMOTED_WITH_GRACE">PROMOTED WITH GRACE</option>
                          <option value="WITHHELD">WITHHELD</option>
                        </select>
                      </div>
                    </div>

                    {/* Remarks Input */}
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2 text-xs">
                      <h4 className="font-bold text-xs text-stone-500 uppercase tracking-wider mb-2">Remarks</h4>
                      <div>
                        <Label className="text-[10px] font-bold text-stone-400 block mb-0.5">Remarks (Mid Term)</Label>
                        <Input
                          value={editingTerm.remarksMid}
                          onChange={(e) => setEditingTerm((t: any) => ({ ...t, remarksMid: e.target.value }))}
                          className="h-8 text-xs border-stone-300"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-stone-400 block mb-0.5">Remarks (Final Term)</Label>
                        <Input
                          value={editingTerm.remarksFinal}
                          onChange={(e) => setEditingTerm((t: any) => ({ ...t, remarksFinal: e.target.value }))}
                          className="h-8 text-xs border-stone-300"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer actions */}
            <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 flex justify-end gap-2 shrink-0">
              <Button variant="outline" onClick={() => setShowMarksEntry(false)}>Cancel</Button>
              <Button onClick={saveMarks} disabled={marksSaving} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold">
                {marksSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-3.5 h-3.5 mr-1" /> Save Marks</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MANAGE SUBJECTS DIALOG MODAL ════════════════════════════════════ */}
      {showManageSubjects && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-stone-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-4 shrink-0">
              <h3 className="font-extrabold text-stone-900 text-sm">Subject Setup & Assignment</h3>
              <button onClick={() => setShowManageSubjects(false)} className="text-stone-400 hover:text-stone-700 text-lg">×</button>
            </div>

            <div className="flex-1 overflow-y-auto grid md:grid-cols-[260px_1fr] gap-6 text-xs min-h-0">
              {/* Left Column: Create/Edit Subject Form */}
              <div className="space-y-4 border-r border-stone-200 pr-6 shrink-0">
                <h4 className="font-black text-stone-700 uppercase tracking-wider text-[10px]">
                  {editingSubject ? "Edit Subject" : "Create Global Subject"}
                </h4>
                <div className="space-y-2.5">
                  <div>
                    <Label className="text-[10px] font-bold text-stone-500">Subject Name *</Label>
                    <Input
                      value={subjectForm.name}
                      onChange={(e) => setSubjectForm(f => ({ ...f, name: e.target.value }))}
                      className="h-8 text-xs border-stone-300"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-stone-500">Subject Code *</Label>
                    <Input
                      value={subjectForm.code}
                      onChange={(e) => setSubjectForm(f => ({ ...f, code: e.target.value }))}
                      className="h-8 text-xs border-stone-300"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-stone-500">Subject Type *</Label>
                    <select
                      value={subjectForm.type}
                      onChange={(e) => setSubjectForm(f => ({ ...f, type: e.target.value as SubjectType }))}
                      className="w-full h-8 px-2 text-xs border border-stone-300 bg-white rounded-md text-stone-700"
                    >
                      <option value="SCHOLASTIC">Scholastic (Main)</option>
                      <option value="CO_SCHOLASTIC">Co-Scholastic (Grades)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-stone-500">Display Order</Label>
                    <Input
                      type="number"
                      value={subjectForm.order}
                      onChange={(e) => setSubjectForm(f => ({ ...f, order: Number(e.target.value) }))}
                      className="h-8 text-xs border-stone-300"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveSubject} className="flex-1 bg-stone-900 text-white font-bold h-8 text-[11px]">
                    {editingSubject ? "Update" : "Create"}
                  </Button>
                  {editingSubject && (
                    <Button variant="outline" size="sm" onClick={() => { setEditingSubject(null); setSubjectForm({ name: "", code: "", type: "SCHOLASTIC", order: 0 }); }} className="h-8 text-[11px]">
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              {/* Right Column: Class Subjects Assignments */}
              <div className="flex flex-col min-h-0 min-w-0">
                <h4 className="font-black text-stone-700 uppercase tracking-wider text-[10px] mb-3">
                  Assign Subjects to Class
                </h4>
                <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100 p-2">
                  {subjectsList.map((sub) => (
                    <div key={sub.id} className="py-2.5 px-3 flex items-center justify-between hover:bg-stone-50/50">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!classAssignments[sub.id]}
                          onChange={(e) => setClassAssignments(prev => ({ ...prev, [sub.id]: e.target.checked }))}
                          className="w-4 h-4 rounded text-indigo-650"
                        />
                        <div>
                          <p className="font-semibold text-stone-850">{sub.name}</p>
                          <p className="text-[10px] text-stone-400 font-mono">{sub.code} · {sub.subjectType}</p>
                        </div>
                      </div>
                      {classAssignments[sub.id] && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={!!classOptional[sub.id]}
                            onChange={(e) => setClassOptional(prev => ({ ...prev, [sub.id]: e.target.checked }))}
                            className="w-3.5 h-3.5 rounded text-stone-500"
                          />
                          <span className="text-[10px] text-stone-500 font-medium">Optional Subject</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-stone-200 pt-3 mt-4 flex justify-end gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowManageSubjects(false)}>Close</Button>
              <Button size="sm" onClick={handleSaveAssignments} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold">
                Save Assignments
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ EXAM CONFIG MODAL ══════════════════════════════════════════════ */}
      {showExamConfig && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-stone-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-4 shrink-0">
              <h3 className="font-extrabold text-stone-900 text-sm">Exam configuration</h3>
              <button onClick={() => setShowExamConfig(false)} className="text-stone-400 hover:text-stone-700 text-lg">×</button>
            </div>

            <div className="flex-1 overflow-y-auto grid md:grid-cols-[300px_1fr] gap-6 text-xs min-h-0">
              {/* Create/Edit Exam Form */}
              <div className="space-y-3.5 border-r border-stone-200 pr-6 shrink-0 overflow-y-auto">
                <h4 className="font-black text-stone-700 uppercase tracking-wider text-[10px]">
                  {editingExam ? "Edit Exam" : "Create Exam"}
                </h4>
                <div className="space-y-2">
                  <div>
                    <Label className="text-[10px] font-bold text-stone-500">Exam Type *</Label>
                    <select
                      value={examForm.examTypeId}
                      onChange={(e) => setExamForm(f => ({ ...f, examTypeId: e.target.value }))}
                      className="w-full h-8 px-2 text-xs border border-stone-300 bg-white rounded-md text-stone-700"
                    >
                      <option value="">Select Type</option>
                      {examTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-stone-500">Exam Name *</Label>
                    <Input
                      value={examForm.name}
                      onChange={(e) => setExamForm(f => ({ ...f, name: e.target.value }))}
                      className="h-8 text-xs border-stone-300"
                      placeholder="e.g. UT-I, Half Yearly"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-bold text-stone-500">Term (1 or 2)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="2"
                        value={examForm.term}
                        onChange={(e) => setExamForm(f => ({ ...f, term: Number(e.target.value) }))}
                        className="h-8 text-xs border-stone-300"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-stone-500">Display Order</Label>
                      <Input
                        type="number"
                        value={examForm.displayOrder}
                        onChange={(e) => setExamForm(f => ({ ...f, displayOrder: Number(e.target.value) }))}
                        className="h-8 text-xs border-stone-300"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-bold text-stone-500">Max Marks</Label>
                      <Input
                        type="number"
                        value={examForm.maxMarks}
                        onChange={(e) => setExamForm(f => ({ ...f, maxMarks: e.target.value }))}
                        className="h-8 text-xs border-stone-300"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-stone-500">Pass Marks</Label>
                      <Input
                        type="number"
                        value={examForm.passMarks}
                        onChange={(e) => setExamForm(f => ({ ...f, passMarks: e.target.value }))}
                        className="h-8 text-xs border-stone-300"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-stone-500">Publish Status</Label>
                    <select
                      value={examForm.publishStatus}
                      onChange={(e) => setExamForm(f => ({ ...f, publishStatus: e.target.value as ExamPublishStatus }))}
                      className="w-full h-8 px-2 text-xs border border-stone-300 bg-white rounded-md text-stone-700"
                    >
                      <option value="DRAFT">DRAFT</option>
                      <option value="PUBLISHED">PUBLISHED</option>
                      <option value="LOCKED">LOCKED</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSaveExam} className="flex-1 bg-stone-900 text-white font-bold h-8 text-[11px]">
                    {editingExam ? "Update" : "Create"}
                  </Button>
                </div>
              </div>

              {/* Exams list for this class */}
              <div className="flex flex-col min-h-0 min-w-0">
                <h4 className="font-black text-stone-700 uppercase tracking-wider text-[10px] mb-3">
                  Configured Class Exams
                </h4>
                <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100">
                  {classExams.map((ex) => (
                    <div key={ex.id} className="py-2.5 px-3 flex items-center justify-between hover:bg-stone-50/50">
                      <div>
                        <p className="font-semibold text-stone-850">{ex.name}</p>
                        <p className="text-[10px] text-stone-400 font-mono">
                          Term {ex.term} · Order {ex.displayOrder} · Max: {ex.maxMarks ? ex.maxMarks : "—"}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingExam(ex);
                            setExamForm({
                              name: ex.name,
                              examTypeId: ex.examTypeId,
                              term: ex.term,
                              displayOrder: ex.displayOrder,
                              maxMarks: ex.maxMarks ? String(ex.maxMarks) : "",
                              passMarks: ex.passMarks ? String(ex.passMarks) : "",
                              publishStatus: ex.publishStatus,
                              visibilityStatus: ex.visibilityStatus,
                              subjects: ex.subjects.map((es: any) => ({
                                subjectId: es.subjectId,
                                maxMarks: es.maxMarks,
                                passMarks: es.passMarks,
                              })),
                            });
                          }}
                          className="h-7 w-7 p-0"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {classExams.length === 0 && (
                    <div className="p-8 text-center text-stone-400">No exams configured for this class</div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-stone-200 pt-3 mt-4 flex justify-end gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowExamConfig(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

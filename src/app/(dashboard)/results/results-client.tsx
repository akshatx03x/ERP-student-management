"use client";

import { useState, useEffect, useTransition, Fragment } from "react";
import { createPortal } from "react-dom";
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
  listGlobalSubjectsAction,
} from "@/server/actions/result.actions";
import { SubjectType, ExamPublishStatus, ResultOutcome, ResultStatus } from "@prisma/client";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────
type Session = { id: string; name: string; isCurrent: boolean };
type ClassItem = { id: string; name: string; sections: { id: string; name: string }[] };
type GlobalSubject = { id: string; name: string; code: string; subjectType: SubjectType; displayOrder: number; isActive?: boolean };
type ExamType = { id: string; name: string };

interface Props {
  sessions: Session[];
  classes: ClassItem[];
  globalSubjects: GlobalSubject[];
  examTypes: ExamType[];
  currentSessionId: string | null;
  userRole: string;
  preselectedFilters?: {
    studentId: string | null;
    classId: string | null;
    sectionId: string | null;
  } | null;
}

export function ResultsClient({ sessions, classes, globalSubjects, examTypes, currentSessionId, userRole, preselectedFilters }: Props) {
  const [isPending, startTransition] = useTransition();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter state
  const [sessionId, setSessionId] = useState(currentSessionId ?? "");
  const [classId, setClassId] = useState(preselectedFilters?.classId ?? "");
  const [sectionId, setSectionId] = useState(preselectedFilters?.sectionId ?? "");
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<any[]>([]);

  // Modals state
  const [showManageSubjects, setShowManageSubjects] = useState(false);
  const [showExamConfig, setShowExamConfig] = useState(false);
  const [showMarksEntry, setShowMarksEntry] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  // Marks Entry state
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [marksData, setMarksData] = useState<any>(null);
  const [editingMarks, setEditingMarks] = useState<Record<string, number>>({});
  const [editingTerm, setEditingTerm] = useState<any>({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);
  const [modificationReason, setModificationReason] = useState("");

  // Subject management state
  const [subjectsList, setSubjectsList] = useState<GlobalSubject[]>(globalSubjects);
  const [editingSubject, setEditingSubject] = useState<GlobalSubject | null>(null);
  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", type: "SCHOLASTIC" as SubjectType, order: 0 });
  const [classAssignments, setClassAssignments] = useState<Record<string, boolean>>({}); // subjectId -> selected
  const [classOptional, setClassOptional] = useState<Record<string, boolean>>({}); // subjectId -> optional
  const [mappingClassId, setMappingClassId] = useState("");

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

  const openReportPreview = async (studentId: string) => {
    setPreviewLoading(true);
    setShowReportPreview(true);
    try {
      const data = await getStudentMarksDataAction(studentId, sessionId);
      setPreviewData(data);
    } catch (err: any) {
      toast.error("Failed to load report card preview data");
      setShowReportPreview(false);
    } finally {
      setPreviewLoading(false);
    }
  };
 
  // Load preselected student report preview if studentId parameter is passed
  useEffect(() => {
    if (mounted && preselectedFilters?.studentId && sessionId) {
      openReportPreview(preselectedFilters.studentId);
    }
  }, [mounted, preselectedFilters?.studentId, sessionId]);

  // ── 1. Marks Entry Grid Recalculations ──────────────────────────────────────
  const handleMarkChange = (examSubjectId: string, val: string) => {
    const numVal = Math.min(100, Math.max(0, Number(val) || 0));
    setEditingMarks((prev) => ({ ...prev, [examSubjectId]: numVal }));
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
    maxRows: number,
    maxCols: number
  ) => {
    let targetRow = rowIndex;
    let targetCol = colIndex;

    if (e.key === "ArrowUp") {
      targetRow = Math.max(0, rowIndex - 1);
    } else if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      targetRow = Math.min(maxRows - 1, rowIndex + 1);
    } else if (e.key === "ArrowLeft") {
      targetCol = Math.max(0, colIndex - 1);
    } else if (e.key === "ArrowRight") {
      targetCol = Math.min(maxCols - 1, colIndex + 1);
    } else {
      return;
    }

    const nextCell = document.getElementById(`cell-${targetRow}-${targetCol}`);
    if (nextCell) {
      (nextCell as HTMLInputElement).focus();
      (nextCell as HTMLInputElement).select();
    }
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
      setModificationReason("");

      setEditingTerm({
        workingDays: data.termResult?.workingDays ?? "",
        presentDays: data.termResult?.presentDays ?? "",
        remarksMid: data.termResult?.remarksMid ?? "",
        remarksFinal: data.termResult?.remarksFinal ?? "",
        resultOutcome: data.termResult?.resultOutcome ?? "PASS",
        status: data.termResult?.status ?? "DRAFT",
        gkGrade: data.termResult?.gkGrade ?? "",
        artGrade: data.termResult?.artGrade ?? "",
        rank: data.termResult?.rank ?? "",
        resultDate: data.termResult?.resultDate ? new Date(data.termResult.resultDate).toISOString().split('T')[0] : "",
        principalRemarks: data.termResult?.principalRemarks ?? "",
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
          gkGrade: editingTerm.gkGrade || null,
          artGrade: editingTerm.artGrade || null,
          rank: editingTerm.rank ? Number(editingTerm.rank) : null,
          resultDate: editingTerm.resultDate ? new Date(editingTerm.resultDate) : null,
          principalRemarks: editingTerm.principalRemarks || null,
        },
        reason: modificationReason || undefined,
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
  const loadClassMapping = async (targetClassId: string) => {
    setMappingClassId(targetClassId);
    if (targetClassId && sessionId) {
      const assigned = await listClassSubjectsAction(targetClassId, sessionId);
      const activeMap: Record<string, boolean> = {};
      const optionalMap: Record<string, boolean> = {};
      assigned.forEach((a: any) => {
        activeMap[a.subjectId] = true;
        optionalMap[a.subjectId] = a.isOptional;
      });
      setClassAssignments(activeMap);
      setClassOptional(optionalMap);
    } else {
      setClassAssignments({});
      setClassOptional({});
    }
  };

  const openManageSubjects = async () => {
    setShowManageSubjects(true);
    await loadClassMapping(classId || classes[0]?.id || "");
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
    if (!mappingClassId || !sessionId) return;
    const assignments = Object.entries(classAssignments)
      .filter(([_, active]) => active)
      .map(([subjectId]) => ({
        subjectId,
        isOptional: !!classOptional[subjectId],
      }));

    try {
      await assignClassSubjectsAction(mappingClassId, sessionId, assignments);
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
            <select disabled={isPending} value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white">
              <option value="">Select Session</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select disabled={isPending} value={classId} onChange={(e) => setClassId(e.target.value)} className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white">
              <option value="">Select Class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {classId && sections.length > 0 && (
              <select disabled={isPending} value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white">
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
        <div className="flex-1 max-h-[580px] overflow-y-auto border border-stone-200 rounded-xl relative min-h-[300px]">
          {isPending ? (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3 z-20">
              <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
              <span className="font-semibold text-xs text-stone-500">Loading student records...</span>
            </div>
          ) : null}
          <table className="w-full text-left text-xs border-collapse relative">
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
                    <td className="py-3 px-6 text-right whitespace-nowrap">
                      {st.hasSavedMarks ? (
                        <div className="flex justify-end gap-1 items-center h-7 text-[11px] font-bold select-none text-stone-500">
                          <button onClick={() => openMarksEntry(st.studentId)} className="hover:text-amber-600 transition-colors">Edit</button>
                          <span className="text-stone-300 font-normal">|</span>
                          <button onClick={() => openReportPreview(st.studentId)} className="hover:text-indigo-650 transition-colors">Preview</button>
                          <span className="text-stone-300 font-normal">|</span>
                          <button onClick={async () => {
                            await openReportPreview(st.studentId);
                            setTimeout(() => {
                              window.print();
                            }, 600);
                          }} className="hover:text-emerald-650 transition-colors">Print</button>
                          <span className="text-stone-300 font-normal">|</span>
                          <button onClick={async () => {
                            await openReportPreview(st.studentId);
                            setTimeout(() => {
                              window.print();
                            }, 600);
                          }} className="hover:text-emerald-650 transition-colors">PDF</button>
                        </div>
                      ) : (
                        <Button size="sm" onClick={() => openMarksEntry(st.studentId)} className="h-7 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg">
                          Enter Marks
                        </Button>
                      )}
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
          <div className="bg-white w-full h-full md:rounded-2xl max-w-7xl md:h-[95vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden">
            <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-extrabold text-stone-950 text-sm">{marksData.student.fullName}</h3>
                <p className="text-stone-500 text-xs mt-0.5 font-medium">
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
                          <th className="py-2.5 px-4 w-48 border-r border-stone-200">Subject</th>
                          {/* Term 1 Header */}
                          <th colSpan={3} className="py-2.5 px-4 text-center bg-indigo-50/20 border-r border-stone-200 text-indigo-900">Term 1</th>
                          <th className="py-2.5 px-2 text-center bg-indigo-50/30 border-r border-stone-200 w-20">T1 Total</th>
                          <th className="py-2.5 px-2 text-center bg-indigo-50/30 border-r border-stone-200 w-16">T1 Grade</th>
                          {/* Term 2 Header */}
                          <th colSpan={3} className="py-2.5 px-4 text-center bg-emerald-50/20 border-r border-stone-200 text-emerald-900">Term 2</th>
                          <th className="py-2.5 px-2 text-center bg-emerald-50/30 border-r border-stone-200 w-20">T2 Total</th>
                          <th className="py-2.5 px-2 text-center bg-emerald-50/30 border-r border-stone-200 w-16">T2 Grade</th>
                          {/* Final Summary Header */}
                          <th className="py-2.5 px-2 text-center bg-violet-50/30 border-r border-stone-200 w-24">Grand Total</th>
                          <th className="py-2.5 px-2 text-center bg-violet-50/30 border-r border-stone-200 w-20">%</th>
                          <th className="py-2.5 px-2 text-center bg-violet-50/30 w-16">Final Grade</th>
                        </tr>
                        <tr className="bg-stone-50/50 border-b border-stone-200 text-[9px] font-bold text-stone-500">
                          <th className="py-2 px-4 border-r border-stone-200">Name (Code)</th>
                          {/* Term 1 Exams */}
                          <th className="py-2 px-2 text-center border-r border-stone-200 w-20">UT-I (10)</th>
                          <th className="py-2 px-2 text-center border-r border-stone-200 w-20">UT-II (10)</th>
                          <th className="py-2 px-2 text-center border-r border-stone-200 w-20">Half Yearly (80)</th>
                          <th className="py-2 px-2 border-r border-stone-200 bg-stone-50"></th>
                          <th className="py-2 px-2 border-r border-stone-200 bg-stone-50"></th>
                          {/* Term 2 Exams */}
                          <th className="py-2 px-2 text-center border-r border-stone-200 w-20">UT-III (10)</th>
                          <th className="py-2 px-2 text-center border-r border-stone-200 w-20">UT-IV (10)</th>
                          <th className="py-2 px-2 text-center border-r border-stone-200 w-20">Annual (80)</th>
                          <th className="py-2 px-2 border-r border-stone-200 bg-stone-50"></th>
                          <th className="py-2 px-2 border-r border-stone-200 bg-stone-50"></th>
                          {/* Final */}
                          <th className="py-2 px-2 border-r border-stone-200 bg-stone-50"></th>
                          <th className="py-2 px-2 border-r border-stone-200 bg-stone-50"></th>
                          <th className="py-2 px-2 bg-stone-50"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {calc?.subjectsSummary.map((sub: any, rowIndex: number) => {
                          // Find exam mapping ids for arrow key coordinates
                          const t1Exams = marksData.exams.filter((e: any) => e.term === 1);
                          const t2Exams = marksData.exams.filter((e: any) => e.term === 2);
                          const orderedExams = [...t1Exams, ...t2Exams];

                          return (
                            <tr key={sub.id} className="hover:bg-stone-50/20">
                              <td className="py-2 px-4 border-r border-stone-200 font-semibold text-stone-700">
                                {sub.name} <span className="text-[10px] text-stone-400 font-mono">({sub.code})</span>
                              </td>
                              
                              {/* Term 1 Input Cells */}
                              {t1Exams.map((ex: any, colIdx: number) => {
                                const es = ex.subjects.find((s: any) => s.subjectId === sub.id);
                                if (!es) return <td key={ex.id} className="py-2 px-2 text-center border-r border-stone-200 bg-stone-50/30 text-stone-400">—</td>;
                                return (
                                  <td key={ex.id} className="py-1 px-1 border-r border-stone-200">
                                    <input
                                      id={`cell-${rowIndex}-${colIdx}`}
                                      type="number"
                                      min="0"
                                      max={es.maxMarks}
                                      value={editingMarks[es.examSubjectId] ?? ""}
                                      onChange={(e) => handleMarkChange(es.examSubjectId, e.target.value)}
                                      onKeyDown={(e) => handleKeyDown(e, rowIndex, colIdx, calc.subjectsSummary.length, 6)}
                                      className="w-full text-center h-7 border border-stone-200 rounded font-bold font-mono focus:border-indigo-500 focus:outline-none"
                                    />
                                  </td>
                                );
                              })}
                              
                              <td className="py-2 px-2 text-center font-mono font-bold bg-indigo-50/10 border-r border-stone-200 text-stone-850">{sub.t1Total} <span className="text-[9px] text-stone-400">/{sub.t1Max}</span></td>
                              <td className="py-2 px-2 text-center font-bold bg-indigo-50/10 border-r border-stone-200 text-indigo-700">{sub.t1Max > 0 ? sub.grade : "—"}</td>
                              
                              {/* Term 2 Input Cells */}
                              {t2Exams.map((ex: any, colIdx: number) => {
                                const es = ex.subjects.find((s: any) => s.subjectId === sub.id);
                                if (!es) return <td key={ex.id} className="py-2 px-2 text-center border-r border-stone-200 bg-stone-50/30 text-stone-400">—</td>;
                                const actualColIndex = colIdx + 3; // Shift by 3 columns of Term 1
                                return (
                                  <td key={ex.id} className="py-1 px-1 border-r border-stone-200">
                                    <input
                                      id={`cell-${rowIndex}-${actualColIndex}`}
                                      type="number"
                                      min="0"
                                      max={es.maxMarks}
                                      value={editingMarks[es.examSubjectId] ?? ""}
                                      onChange={(e) => handleMarkChange(es.examSubjectId, e.target.value)}
                                      onKeyDown={(e) => handleKeyDown(e, rowIndex, actualColIndex, calc.subjectsSummary.length, 6)}
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
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Calculations Details Summary Card */}
                  <div className="grid md:grid-cols-4 gap-6 pt-4">
                    {/* Metrics Summary */}
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
                      <h4 className="font-bold text-xs text-stone-500 uppercase tracking-wider mb-2">Auto Calculations</h4>
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
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] font-bold text-stone-500">GK Grade</Label>
                          <Input
                            value={editingTerm.gkGrade || ""}
                            onChange={(e) => setEditingTerm((t: any) => ({ ...t, gkGrade: e.target.value }))}
                            className="h-8 text-xs border-stone-300"
                            placeholder="e.g. A, B"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold text-stone-500">Art & Activity</Label>
                          <Input
                            value={editingTerm.artGrade || ""}
                            onChange={(e) => setEditingTerm((t: any) => ({ ...t, artGrade: e.target.value }))}
                            className="h-8 text-xs border-stone-300"
                            placeholder="e.g. A, B"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Evaluation Status & Outcome */}
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2 text-xs">
                      <h4 className="font-bold text-xs text-stone-500 uppercase tracking-wider mb-2">Outcome & Status</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] font-bold text-stone-500">Outcome Status</Label>
                          <select
                            value={editingTerm.resultOutcome}
                            onChange={(e) => setEditingTerm((t: any) => ({ ...t, resultOutcome: e.target.value }))}
                            className="w-full h-8 px-2 text-xs border border-stone-300 rounded-md bg-white text-stone-700"
                          >
                            <option value="PASS">PASS</option>
                            <option value="FAIL">FAIL</option>
                            <option value="PROMOTED_WITH_GRACE">PROMOTED</option>
                            <option value="WITHHELD">WITHHELD</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold text-stone-500">Rank</Label>
                          <Input
                            type="number"
                            value={editingTerm.rank || ""}
                            onChange={(e) => setEditingTerm((t: any) => ({ ...t, rank: e.target.value }))}
                            className="h-8 text-xs border-stone-300"
                            placeholder="Override..."
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-stone-500">Result Date</Label>
                        <Input
                          type="date"
                          value={editingTerm.resultDate || ""}
                          onChange={(e) => setEditingTerm((t: any) => ({ ...t, resultDate: e.target.value }))}
                          className="h-8 text-xs border-stone-300"
                        />
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
                    {marksData.termResult && (marksData.termResult.status === "PUBLISHED" || marksData.termResult.status === "LOCKED") && (
                      <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-4 space-y-2 text-xs md:col-span-4">
                        <Label className="text-[10px] font-bold text-rose-700 block mb-0.5">Reason for Modification * (Required)</Label>
                        <Input
                          value={modificationReason}
                          onChange={(e) => setModificationReason(e.target.value)}
                          placeholder="Please provide the official reason for modifying this published/locked result..."
                          className="text-xs border-rose-300 focus:border-rose-500 focus:ring-rose-500 bg-white"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer actions */}
            <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 flex justify-between items-center shrink-0">
              <span className="text-xs text-stone-500 font-medium">Use arrow keys (↑ ↓ ← →) or Enter/Tab to navigate cells like Excel.</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowMarksEntry(false)}>Cancel</Button>
                
                <Button 
                  onClick={() => {
                    setEditingTerm((t: any) => ({ ...t, status: "DRAFT" }));
                    setTimeout(saveMarks, 100);
                  }} 
                  disabled={marksSaving} 
                  className="bg-stone-750 hover:bg-indigo-600 text-grey font-bold"
                >
                  {marksSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Draft"}
                </Button>
                
                <Button 
                  onClick={() => {
                    setEditingTerm((t: any) => ({ ...t, status: "COMPLETED" }));
                    setTimeout(saveMarks, 100);
                  }} 
                  disabled={marksSaving} 
                  className="bg-indigo-650 hover:bg-indigo-600 text-grey font-bold"
                >
                  {marksSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & Complete"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MANAGE SUBJECTS DIALOG MODAL ════════════════════════════════════ */}
      {showManageSubjects && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-stone-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-4 shrink-0">
              <h3 className="font-extrabold text-stone-900 text-sm">Subject Setup & Assignment</h3>
              <button onClick={() => setShowManageSubjects(false)} className="text-stone-400 hover:text-stone-700 text-lg">×</button>
            </div>

            <div className="flex-1 grid md:grid-cols-[340px_1fr] gap-6 text-xs min-h-0">
              {/* Left Column: Create/Edit Subject Form & Subject List Table */}
              <div className="space-y-4 border-r border-stone-200 pr-6 shrink-0 flex flex-col min-h-0">
                <div className="space-y-3">
                  <h4 className="font-black text-stone-700 uppercase tracking-wider text-[10px]">
                    {editingSubject ? "Edit Subject" : "Create Global Subject"}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-bold text-stone-500">Name *</Label>
                      <Input
                        value={subjectForm.name}
                        onChange={(e) => setSubjectForm(f => ({ ...f, name: e.target.value }))}
                        className="h-8 text-xs border-stone-300"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-stone-500">Code *</Label>
                      <Input
                        value={subjectForm.code}
                        onChange={(e) => setSubjectForm(f => ({ ...f, code: e.target.value }))}
                        className="h-8 text-xs border-stone-300"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-bold text-stone-500">Type *</Label>
                      <select
                        value={subjectForm.type}
                        onChange={(e) => setSubjectForm(f => ({ ...f, type: e.target.value as SubjectType }))}
                        className="w-full h-8 px-2 text-xs border border-stone-300 bg-white rounded-md text-stone-700"
                      >
                        <option value="SCHOLASTIC">Scholastic</option>
                        <option value="CO_SCHOLASTIC">Co-Scholastic</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-stone-500">Order</Label>
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

                <div className="flex-1 min-h-0 flex flex-col border-t border-stone-100 pt-3">
                  <h4 className="font-black text-stone-700 uppercase tracking-wider text-[10px] mb-2">Subject Master Table</h4>
                  <div className="h-[220px] overflow-y-auto border border-stone-200 rounded-lg p-1.5 divide-y divide-stone-100">
                    {subjectsList.map((sub) => (
                      <div key={sub.id} className={cn("py-2 px-1 flex justify-between items-center hover:bg-stone-50/50", !sub.isActive && "opacity-50")}>
                        <div className="truncate pr-2">
                          <p className="font-semibold text-stone-800 truncate" title={sub.name}>{sub.name}</p>
                          <p className="text-[9px] text-stone-450 font-mono">{sub.code} · {sub.subjectType} {!sub.isActive && "(Archived)"}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setEditingSubject(sub);
                              setSubjectForm({ name: sub.name, code: sub.code, type: sub.subjectType, order: sub.displayOrder });
                            }}
                            className="p-1 text-stone-500 hover:text-stone-900"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`Are you sure you want to delete/archive "${sub.name}"?`)) {
                                try {
                                  const res = await deleteGlobalSubjectAction(sub.id);
                                  if (res.archived) {
                                    toast.success("Subject archived because marks exist");
                                  } else {
                                    toast.success("Subject deleted permanently");
                                  }
                                  // Reload lists
                                  const list = await listGlobalSubjectsAction();
                                  setSubjectsList(list);
                                } catch (err: any) {
                                  toast.error(err.message || "Failed to delete");
                                }
                              }
                            }}
                            className="p-1 text-stone-500 hover:text-rose-600"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Class Subjects Assignments */}
              <div className="flex flex-col min-h-0 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-black text-stone-700 uppercase tracking-wider text-[10px]">
                    Class-wise Subject Mapping
                  </h4>
                  <select
                    value={mappingClassId}
                    onChange={(e) => loadClassMapping(e.target.value)}
                    className="h-7 px-2 text-xs border border-stone-300 rounded bg-white font-semibold text-stone-700 focus:outline-none"
                  >
                    <option value="">Select Class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                 <div className="h-[380px] overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100 p-2">
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
      {/* ══ REPORT CARD PREVIEW MODAL (A4 PRINTABLE) ══════════════════════ */}
      {mounted && showReportPreview && createPortal(
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-0 md:p-6 overflow-hidden print-modal-backdrop">
          <div className="bg-white w-full h-full md:rounded-2xl max-w-4xl md:h-[95vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden print-modal-panel">
            
            {/* Header toolbar */}
            <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex justify-between items-center shrink-0 no-print">
              <div>
                <h3 className="font-extrabold text-stone-900 text-sm">Report Card Preview</h3>
                <p className="text-stone-500 text-xs mt-0.5 font-medium">Verify card layout and details before printing or saving.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowReportPreview(false)}>Close</Button>
                
                {previewData && (previewData.termResult?.status === "DRAFT" || previewData.termResult?.status === "COMPLETED") && (
                  <Button 
                    size="sm" 
                    onClick={async () => {
                      setPublishLoading(true);
                      try {
                        await saveStudentMarksAction({
                          studentId: previewData.student.id,
                          sessionId,
                          marks: previewData.markEntries.map((m: any) => ({
                            examSubjectId: m.examSubjectId,
                            marksObtained: m.marksObtained,
                          })),
                          termDetail: {
                            status: "PUBLISHED",
                          },
                        });
                        toast.success("Result published successfully");
                        setShowReportPreview(false);
                        loadStudents();
                      } catch (err: any) {
                        toast.error(err.message || "Failed to publish result");
                      } finally {
                        setPublishLoading(false);
                      }
                    }}
                    disabled={publishLoading} 
                    className="bg-indigo-650 hover:bg-indigo-600 text-grey-600 font-bold h-8 text-xs"
                  >
                    Publish Result
                  </Button>
                )}

                <Button 
                  size="sm" 
                  onClick={() => {
                    window.print();
                  }} 
                  className="bg-black-650 hover:bg-emerald-600 text-grey-600 font-bold h-8 text-xs"
                >
                  Print / Save PDF
                </Button>
              </div>
            </div>

            {/* Print styling block */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                /* Hide everything else */
                body > *:not(.print-modal-backdrop) {
                  display: none !important;
                }
                .no-print {
                  display: none !important;
                }
                .print-modal-backdrop {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  background: none !important;
                  backdrop-filter: none !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  display: block !important;
                  z-index: auto !important;
                }
                .print-modal-panel {
                  width: 100% !important;
                  max-width: none !important;
                  height: auto !important;
                  border: none !important;
                  box-shadow: none !important;
                  background: white !important;
                  display: block !important;
                  border-radius: 0 !important;
                }
                .print-modal-scroll {
                  overflow: visible !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  display: block !important;
                  background: white !important;
                }
                #report-card-print {
                  border: none !important;
                  box-shadow: none !important;
                  margin: 0 auto !important;
                  padding: 0 !important;
                  width: 100% !important;
                  max-width: 210mm !important;
                  min-height: 297mm !important;
                  background: white !important;
                  color: black !important;
                }
              }
            ` }} />

            {/* Card Content (Print target area) */}
            <div className="flex-1 overflow-y-auto p-8 bg-stone-100 flex justify-center print-modal-scroll">
              {previewLoading ? (
                <div className="flex items-center justify-center h-48 text-stone-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Generating card...</div>
              ) : previewData ? (
                <div id="report-card-print" className="bg-white p-8 w-full max-w-[210mm] min-h-[297mm] shadow-md flex flex-col justify-between font-serif text-black text-xs select-none">
                  
                  {/* Master Table Container representing the exact printed layout */}
                  <table className="w-full border-collapse border-2 border-black text-center text-[10px] font-bold text-black">
                    <tbody>
                      {/* 1. School Header Row */}
                      <tr>
                        <td colSpan={16} className="p-4 border-b-2 border-black">
                          <div className="flex items-center justify-between">
                            {/* Logo */}
                            <div className="w-16 h-16 border border-black flex items-center justify-center text-[8px] uppercase tracking-tighter shrink-0 select-none text-center font-sans">
                              VPS LOGO
                            </div>
                            {/* School details */}
                            <div className="flex-1 text-center pr-12">
                              <h2 className="text-xl font-extrabold tracking-wide font-serif leading-none">VIDYANJALI PUBLIC SCHOOL</h2>
                              <p className="text-[10px] font-bold mt-1.5">Karhera Mohan Nagar,Ghaziabad</p>
                              <h3 className="text-[11px] font-extrabold uppercase mt-1">
                                Annual Assessment Report 2025-26
                              </h3>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* 2. Student Info Row */}
                      <tr className="border-b-2 border-black text-left text-[10px]">
                        <td colSpan={5} className="py-2 px-2 border-r border-black">
                          <span>Name: </span><span className="font-extrabold font-sans uppercase">{previewData.student.fullName}</span>
                        </td>
                        <td colSpan={4} className="py-2 px-2 border-r border-black">
                          <span>CLASS: </span><span className="font-extrabold font-sans uppercase">{previewData.student.classSection.split("-")[0] || "—"}</span>
                        </td>
                        <td colSpan={2} className="py-2 px-2 border-r border-black">
                          <span>SEC: </span><span className="font-extrabold font-sans uppercase">{previewData.student.classSection.split("-")[1] || "—"}</span>
                        </td>
                        <td colSpan={5} className="py-2 px-2">
                          <span>DATE OF RESULT - </span><span className="font-extrabold font-sans">{previewData.termResult?.resultDate ? new Date(previewData.termResult.resultDate).toLocaleDateString("en-GB") : "14 / 03 / 2026"}</span>
                        </td>
                      </tr>

                      {/* 3. Main Assessment Column Headers */}
                      <tr className="border-b border-black text-[9px] uppercase">
                        <th rowSpan={2} className="py-2.5 border-r border-black w-8">S.No.</th>
                        <th rowSpan={2} className="py-2.5 px-2 text-left border-r border-black w-36">SUBJECTS</th>
                        <th colSpan={5} className="py-1 border-r border-black">FIRST TERM EVALUATION</th>
                        <th colSpan={5} className="py-1 border-r border-black">SECOND TERM EVALUATION</th>
                        <th rowSpan={2} className="py-2.5 border-r border-black w-12 text-[8px] leading-tight">Total<br/>(1st<br/>Term)</th>
                        <th rowSpan={2} className="py-2.5 border-r border-black w-12 text-[8px] leading-tight">Total<br/>(2nd<br/>Term)</th>
                        <th rowSpan={2} className="py-2.5 border-r border-black w-14 text-[8px] leading-tight">FINAL TOTAL<br/>(1st Term +<br/>2nd Term)</th>
                        <th rowSpan={2} className="py-2.5 w-12 text-[8px] leading-tight">FINAL<br/>GRADES</th>
                      </tr>

                      {/* Sub-headers row */}
                      <tr className="border-b border-black text-[8px] text-stone-700">
                        {/* T1 */}
                        <th className="py-1 border-r border-black w-8">UT-I</th>
                        <th className="py-1 border-r border-black w-8">UT-II</th>
                        <th className="py-1 border-r border-black w-10">HLY</th>
                        <th className="py-1 border-r border-black w-10">TOTAL</th>
                        <th className="py-1 border-r border-black w-8">GRADE</th>
                        {/* T2 */}
                        <th className="py-1 border-r border-black w-8">UT-III</th>
                        <th className="py-1 border-r border-black w-8">UT-IV</th>
                        <th className="py-1 border-r border-black w-10">Aunnal</th>
                        <th className="py-1 border-r border-black w-10">TOTAL</th>
                        <th className="py-1 border-r border-black w-8">GRADE</th>
                      </tr>

                      {/* 4. Subject Marks Rows */}
                      {previewData.subjects.map((sub: any, idx: number) => {
                        const t1Exams = previewData.exams.filter((e: any) => e.term === 1);
                        const t2Exams = previewData.exams.filter((e: any) => e.term === 2);

                        let t1Total = 0;
                        let t1Max = 0;
                        let t2Total = 0;
                        let t2Max = 0;

                        t1Exams.forEach((ex: any) => {
                          const es = ex.subjects.find((s: any) => s.subjectId === sub.id);
                          if (es) {
                            const entry = previewData.markEntries.find((me: any) => me.examSubjectId === es.examSubjectId);
                            t1Total += entry?.marksObtained ?? 0;
                            t1Max += es.maxMarks;
                          }
                        });

                        t2Exams.forEach((ex: any) => {
                          const es = ex.subjects.find((s: any) => s.subjectId === sub.id);
                          if (es) {
                            const entry = previewData.markEntries.find((me: any) => me.examSubjectId === es.examSubjectId);
                            t2Total += entry?.marksObtained ?? 0;
                            t2Max += es.maxMarks;
                          }
                        });

                        const grandTotal = t1Total + t2Total;
                        const grandMax = t1Max + t2Max;

                        const getGrade = (val: number, max: number) => {
                          if (max === 0) return "—";
                          const pct = (val / max) * 100;
                          if (pct >= 90) return "A1";
                          if (pct >= 80) return "A2";
                          if (pct >= 70) return "B1";
                          if (pct >= 60) return "B2";
                          if (pct >= 50) return "C1";
                          if (pct >= 40) return "C2";
                          if (pct >= 33) return "D";
                          return "E";
                        };

                        const getExamMark = (name: string) => {
                          const ex = previewData.exams.find((e: any) => e.name === name);
                          const es = ex?.subjects.find((s: any) => s.subjectId === sub.id);
                          const me = previewData.markEntries.find((m: any) => m.examSubjectId === es?.examSubjectId);
                          return me ? String(me.marksObtained) : "—";
                        };

                        return (
                          <tr key={sub.id} className="border-b border-black text-black">
                            <td className="py-2 border-r border-black">{idx + 1}</td>
                            <td className="py-2 px-2 text-left font-bold border-r border-black">{sub.name}</td>
                            {/* T1 */}
                            <td className="py-2 border-r border-black">{getExamMark("UT-I")}</td>
                            <td className="py-2 border-r border-black">{getExamMark("UT-II")}</td>
                            <td className="py-2 border-r border-black">{getExamMark("Half Yearly")}</td>
                            <td className="py-2 border-r border-black font-bold">{t1Max > 0 ? t1Total : "—"}</td>
                            <td className="py-2 border-r border-black font-bold">{getGrade(t1Total, t1Max)}</td>
                            {/* T2 */}
                            <td className="py-2 border-r border-black">{getExamMark("UT-III")}</td>
                            <td className="py-2 border-r border-black">{getExamMark("UT-IV")}</td>
                            <td className="py-2 border-r border-black">{getExamMark("Annual")}</td>
                            <td className="py-2 border-r border-black font-bold">{t2Max > 0 ? t2Total : "—"}</td>
                            <td className="py-2 border-r border-black font-bold">{getGrade(t2Total, t2Max)}</td>
                            {/* Final columns */}
                            <td className="py-2 border-r border-black font-bold">{t1Max > 0 ? t1Total : "—"}</td>
                            <td className="py-2 border-r border-black font-bold">{t2Max > 0 ? t2Total : "—"}</td>
                            <td className="py-2 border-r border-black font-black">{grandMax > 0 ? grandTotal : "—"}</td>
                            <td className="py-2 font-black">{getGrade(grandTotal, grandMax)}</td>
                          </tr>
                        );
                      })}

                      {/* 5. Grand Total Row */}
                      <tr className="border-b border-black text-black">
                        <td colSpan={2} className="py-1 px-2 text-left border-r border-black">Grand Total</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold">{calc?.grandTotal}</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold">{calc?.grandTotal}</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold">{calc?.grandTotal}</td>
                        <td className="border-r border-black font-bold">{calc?.grandTotal}</td>
                        <td className="border-r border-black font-black">{calc?.grandTotal}</td>
                        <td>&nbsp;</td>
                      </tr>

                      {/* 6. Percentage Row */}
                      <tr className="border-b border-black text-black">
                        <td colSpan={2} className="py-1 px-2 text-left border-r border-black">Percentage</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold">{calc?.percentage}</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold">{calc?.percentage}</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold">{calc?.percentage}</td>
                        <td className="border-r border-black font-bold">{calc?.percentage}</td>
                        <td className="border-r border-black font-black">{calc?.percentage}</td>
                        <td className="font-bold">{calc?.finalGrade}</td>
                      </tr>

                      {/* 7. Attendance Row */}
                      <tr className="border-b border-black text-black">
                        <td colSpan={2} className="py-1 px-2 text-left border-r border-black">ATTENDANCE</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold">{previewData.termResult?.presentDays ?? "—"}</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold">{previewData.termResult?.workingDays ?? "—"}</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-black">
                          {previewData.termResult?.presentDays && previewData.termResult?.workingDays 
                            ? Number(previewData.termResult.presentDays) + Number(previewData.termResult.workingDays) 
                            : "—"}
                        </td>
                        <td>&nbsp;</td>
                      </tr>

                      {/* 8. Art & Activity Row */}
                      <tr className="border-b border-black text-black">
                        <td colSpan={2} className="py-1 px-2 text-left border-r border-black">ART &ACTIVITY</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold uppercase">{previewData.termResult?.artGrade || "—"}</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold uppercase">{previewData.termResult?.artGrade || "—"}</td>
                        <td colSpan={6}>&nbsp;</td>
                      </tr>

                      {/* 9. GK Row */}
                      <tr className="border-b border-black text-black">
                        <td colSpan={2} className="py-1 px-2 text-left border-r border-black">GK</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold uppercase">{previewData.termResult?.gkGrade || "—"}</td>
                        <td className="border-r border-black">&nbsp;</td>
                        <td colSpan={3} className="border-r border-black">&nbsp;</td>
                        <td className="border-r border-black font-bold uppercase">{previewData.termResult?.gkGrade || "—"}</td>
                        <td colSpan={2} className="border-r border-black">&nbsp;</td>
                        <td colSpan={2} className="border-r border-black font-bold text-center">RESULT</td>
                        <td className="font-extrabold uppercase text-center">{previewData.termResult?.resultOutcome || "PASS"}</td>
                      </tr>

                      {/* 10. Remarks row header */}
                      <tr className="border-b border-black text-[9px] uppercase">
                        <td colSpan={2} className="py-1.5 border-r border-black">REMARKS</td>
                        <td colSpan={5} className="py-1.5 border-r border-black">MID TERM EVALUATION</td>
                        <td colSpan={5} className="py-1.5 border-r border-black">FINAL TERM EVALUATION</td>
                        <td colSpan={4} className="py-1.5 font-bold uppercase text-center">RANK</td>
                      </tr>

                      {/* Promoted row */}
                      <tr className="border-b border-black">
                        <td colSpan={12} className="py-1 px-2 border-r border-black text-center font-extrabold uppercase tracking-wide">
                          {previewData.termResult?.remarksFinal ? "PROMOTED WITH GRACE" : "PROMOTED WITH GRACE"}
                        </td>
                        <td colSpan={4} className="py-1 font-bold text-center">
                          {previewData.termResult?.rank ? `${previewData.termResult.rank}` : "NA"}
                        </td>
                      </tr>

                      {/* 11. Comments layout box */}
                      <tr className="border-b-2 border-black text-left font-normal text-[9.5px]">
                        <td colSpan={7} className="py-6 px-3 border-r border-black align-top leading-relaxed w-1/2">
                          <span className="font-sans text-stone-800">{previewData.termResult?.remarksMid || "Dear put some extra efforts to do studies .You can achieve your goal"}</span>
                        </td>
                        <td colSpan={9} className="py-6 px-3 align-top leading-relaxed w-1/2">
                          <span className="font-sans text-stone-800">{previewData.termResult?.remarksFinal || "Dear put some extra efforts to do studies .You can achieve your goal"}</span>
                        </td>
                      </tr>

                      {/* 12. Signatures Row */}
                      <tr className="text-center font-bold text-[9px] uppercase">
                        <td colSpan={5} className="py-6 px-2 border-r border-black valign-bottom">
                          <div className="border-t border-stone-300 pt-1 mt-6 w-3/4 mx-auto">CLASS TEACHER SIGNATURE</div>
                        </td>
                        <td colSpan={6} className="py-6 px-2 border-r border-black valign-bottom">
                          <div className="border-t border-stone-300 pt-1 mt-6 w-3/4 mx-auto">PARENTS SIGNATURE</div>
                        </td>
                        <td colSpan={5} className="py-6 px-2 valign-bottom">
                          <div className="border-t border-stone-300 pt-1 mt-6 w-3/4 mx-auto">PRINCIPAL SIGNATURE</div>
                        </td>
                      </tr>

                    </tbody>
                  </table>

                </div>
              ) : null}
            </div>

          </div>
        </div>
      , document.body)}
      {/* ══ END OF REPORT CARD PREVIEW ══════════════════════════════════════ */}
    </>
  );
}

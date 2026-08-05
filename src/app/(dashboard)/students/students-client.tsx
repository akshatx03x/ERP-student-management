"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import {
  deleteStudentAction,
  exportStudentsAction,
  validateStudentsImportAction,
  executeStudentsImportAction,
  executeSingleRowImportAction,
  downloadImportSampleAction,
} from "@/server/actions/student.actions";

type StudentRow = {
  id: string;
  fullName: string;
  admissionNo: string;
  status: string;
  photoUrl?: string | null;
  family: {
    fatherName: string | null;
    motherName: string | null;
    primaryPhone?: string | null;
    secondaryPhone?: string | null;
  } | null;
  enrollments: Array<{
    class: { name: string };
    section: { name: string };
    session: { name: string };
  }>;
};

type ClassRow = {
  id: string;
  name: string;
  sections: Array<{ id: string; name: string }>;
};

type SessionRow = {
  id: string;
  name: string;
};

export function StudentsClient({
  students,
  initialSearch,
  canDelete,
  currentUserStudentId,
  classes,
  initialClassId,
  initialSectionId,
  sessions,
  initialSessionId,
}: {
  students: StudentRow[];
  initialSearch: string;
  canDelete: boolean;
  currentUserStudentId?: string;
  classes: ClassRow[];
  initialClassId: string;
  initialSectionId: string;
  sessions: SessionRow[];
  initialSessionId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const [selectedSectionId, setSelectedSectionId] = useState((selectedClassId === "ALL" || selectedClassId === "") ? "" : initialSectionId);
  const [pending, startTransition] = useTransition();
  const [showRecommendations, setShowRecommendations] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [importResult, setImportResult] = useState<{
    successCount: number;
    failCount: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  // Debounced search: fire server fetch 350ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      applyFilters(search, selectedSessionId, selectedClassId, selectedSectionId);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeClass = classes.find((c) => c.id === selectedClassId);
  const activeSections = activeClass?.sections ?? [];

  const displayedStudents = useMemo(() => {
    return students.filter((s) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.admissionNo.toLowerCase().includes(q) ||
        s.family?.fatherName?.toLowerCase().includes(q) ||
        s.family?.motherName?.toLowerCase().includes(q) ||
        s.family?.primaryPhone?.includes(q) ||
        s.family?.secondaryPhone?.includes(q)
      );
    });
  }, [students, search]);

  const applyFilters = (searchVal: string, sessionIdVal: string, classIdVal: string, sectionIdVal: string) => {
    const params = new URLSearchParams();
    if (searchVal.trim()) params.set("q", searchVal.trim());
    if (sessionIdVal) params.set("sessionId", sessionIdVal);
    if (classIdVal) params.set("classId", classIdVal);
    if (sectionIdVal) params.set("sectionId", sectionIdVal);
    
    const queryStr = params.toString();
    startTransition(() => {
      router.push(queryStr ? `/students?${queryStr}` : "/students");
    });
  };

  const handleExport = () => {
    startTransition(async () => {
      try {
        const base64 = await exportStudentsAction({
          search,
          classId: selectedClassId,
          sectionId: selectedSectionId,
          sessionId: selectedSessionId,
        } as any);
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `students_export_${new Date().toISOString().split("T")[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Students exported successfully");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to export students");
      }
    });
  };

  // Import Engine State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<"WIZARD_START" | "UPLOAD" | "PREVIEW" | "RESULT">("WIZARD_START");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"SKIP" | "UPDATE" | "FAIL">("SKIP");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [previewFilter, setPreviewFilter] = useState<"ALL" | "READY" | "WARNING" | "ERROR">("ALL");

  const originalPreviewDataRef = useRef<any>(null);
  const [importProgress, setImportProgress] = useState<{
    total: number;
    processed: number;
    remaining: number;
    currentName: string;
  } | null>(null);

  const [previewData, setPreviewData] = useState<{
    summary: {
      ready: number;
      warnings: number;
      errors: number;
      total: number;
      duplicates?: number;
      missingRequired?: number;
      unknownClasses?: number;
      unknownSections?: number;
      missingFeeStructures?: number;
    };
    rows: Array<{
      rowNumber: number;
      studentName: string;
      admissionNo: string;
      className: string;
      sectionName: string;
      status: "READY" | "WARNING" | "ERROR";
      reason: string;
      data: any;
    }>;
  } | null>(null);

  const [executionResult, setExecutionResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const handleDownloadSample = async () => {
    try {
      const base64 = await downloadImportSampleAction();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "students_import_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Import template downloaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to download template");
    }
  };

  const handleUploadAndAnalyze = async (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setIsAnalyzing(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const base64 = btoa(binary);
      const result = await validateStudentsImportAction(base64, duplicateStrategy);

      setPreviewData(result);
      originalPreviewDataRef.current = JSON.parse(JSON.stringify(result));
      setImportStep("PREVIEW");
      toast.success("Excel analysis completed successfully");
    } catch (err: any) {
      toast.error(err.message || "Excel analysis failed. Please verify the file structure.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleInlineEdit = (rowIndex: number, field: "className" | "sectionName" | "gender" | "category", value: string) => {
    if (!previewData) return;
    const updatedRows = [...previewData.rows];
    const rowIdx = updatedRows.findIndex(r => r.rowNumber === rowIndex);
    if (rowIdx === -1) return;

    const row = { ...updatedRows[rowIdx]! };
    row.data = { ...row.data };

    if (field === "className") {
      row.className = value;
      row.data.className = value;
      const matchedClass = classes.find(c => c.name === value);
      if (matchedClass) {
        row.data.classId = matchedClass.id;
        const hasSection = matchedClass.sections.some(s => s.name === row.sectionName);
        if (!hasSection && matchedClass.sections.length > 0) {
          row.sectionName = matchedClass.sections[0]!.name;
          row.data.sectionName = matchedClass.sections[0]!.name;
          row.data.sectionId = matchedClass.sections[0]!.id;
        }
      } else {
        row.data.classId = null;
        row.data.sectionId = null;
      }
    } else if (field === "sectionName") {
      row.sectionName = value;
      row.data.sectionName = value;
      const matchedClass = classes.find(c => c.id === row.data.classId);
      const matchedSec = matchedClass?.sections.find(s => s.name === value);
      if (matchedSec) {
        row.data.sectionId = matchedSec.id;
      } else {
        row.data.sectionId = null;
      }
    } else if (field === "gender") {
      row.data.gender = value;
    } else if (field === "category") {
      row.data.category = value;
    }

    // Client-side re-validation
    let status: "READY" | "WARNING" | "ERROR" = "READY";
    const reasons: string[] = [];

    if (!row.admissionNo) {
      status = "ERROR";
      reasons.push("Admission Number is required");
    }
    if (!row.studentName) {
      status = "ERROR";
      reasons.push("Student Name is required");
    }
    if (!row.className) {
      status = "ERROR";
      reasons.push("Class is required");
    }
    if (!row.sectionName) {
      status = "ERROR";
      reasons.push("Section is required");
    }

    const matchedClass = classes.find(c => c.name === row.className);
    if (matchedClass) {
      const matchedSec = matchedClass.sections.find(s => s.name === row.sectionName);
      if (!matchedSec) {
        status = "ERROR";
        reasons.push(`Section "${row.sectionName}" not found in class "${row.className}"`);
      }
    } else {
      status = "ERROR";
      reasons.push(`Class "${row.className}" not found in ERP`);
    }

    const dupInSheet = updatedRows.some((r, idx) => idx !== rowIdx && r.admissionNo === row.admissionNo);
    if (dupInSheet) {
      status = "ERROR";
      reasons.push(`Duplicate Admission No "${row.admissionNo}" in Excel`);
    }

    const originalRow = originalPreviewDataRef.current?.rows.find((r: any) => r.rowNumber === rowIndex);
    if (originalRow && originalRow.admissionNo === row.admissionNo && originalRow.reason.includes("already exists")) {
      if (duplicateStrategy === "FAIL") {
        status = "ERROR";
        reasons.push(`Admission No. "${row.admissionNo}" already exists in ERP`);
      } else if (duplicateStrategy === "SKIP") {
        status = "WARNING";
        reasons.push(`Admission No. "${row.admissionNo}" already exists (Row will be skipped)`);
      } else if (duplicateStrategy === "UPDATE") {
        status = "READY";
        reasons.push(`Admission No. "${row.admissionNo}" already exists (Existing record will be updated)`);
      }
    }

    row.status = status;
    row.reason = reasons.join("; ") || "Ready";

    updatedRows[rowIdx] = row;

    // Summaries update
    const readyCount = updatedRows.filter(r => r.status === "READY").length;
    const warningCount = updatedRows.filter(r => r.status === "WARNING").length;
    const errorCount = updatedRows.filter(r => r.status === "ERROR").length;
    const duplicateCount = updatedRows.filter(r => r.reason.toLowerCase().includes("duplicate") || r.reason.toLowerCase().includes("already exists")).length;
    const missingRequiredCount = updatedRows.filter(r => r.reason.toLowerCase().includes("required")).length;
    const unknownClassCount = updatedRows.filter(r => r.reason.toLowerCase().includes("class") && r.reason.toLowerCase().includes("not found")).length;
    const unknownSectionCount = updatedRows.filter(r => r.reason.toLowerCase().includes("section") && r.reason.toLowerCase().includes("not found")).length;

    setPreviewData({
      summary: {
        ready: readyCount,
        warnings: warningCount,
        errors: errorCount,
        total: updatedRows.length,
        duplicates: duplicateCount,
        missingRequired: missingRequiredCount,
        unknownClasses: unknownClassCount,
        unknownSections: unknownSectionCount
      },
      rows: updatedRows
    });
  };

  const handleConfirmImport = async () => {
    if (!previewData || previewData.summary.errors > 0) {
      toast.error("Please fix all errors before importing");
      return;
    }
    setIsCommitting(true);

    if (duplicateStrategy === "FAIL") {
      setImportProgress({
        total: previewData.rows.length,
        processed: 0,
        remaining: previewData.rows.length,
        currentName: "Processing atomically (Single Transaction)..."
      });
      try {
        const result = await executeStudentsImportAction(previewData.rows, "FAIL");
        setExecutionResult(result);
        setImportStep("RESULT");
        toast.success("Excel batch import completed!");
        router.refresh();
      } catch (err: any) {
        toast.error(err.message || "Batch transaction failed. Database rolled back.");
      } finally {
        setImportProgress(null);
        setIsCommitting(false);
      }
    } else {
      const rowsToProcess = previewData.rows.filter(r => r.status !== "ERROR");
      const total = rowsToProcess.length;
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;

      setImportProgress({ total, processed: 0, remaining: total, currentName: "" });

      for (let i = 0; i < total; i++) {
        const row = rowsToProcess[i]!;
        setImportProgress({
          total,
          processed: i,
          remaining: total - i,
          currentName: row.studentName || row.admissionNo
        });

        try {
          const res = await executeSingleRowImportAction(row, duplicateStrategy);
          imported += res.imported;
          updated += res.updated;
          skipped += res.skipped;
          failed += res.failed;
        } catch (err: any) {
          failed++;
        }
      }

      setImportProgress(null);
      setIsCommitting(false);
      setExecutionResult({ imported, updated, skipped, failed });
      setImportStep("RESULT");
      toast.success("Excel batch import completed!");
      router.refresh();
    }
  };

  const getSuggestedFix = (reason: string) => {
    const r = reason.toLowerCase();
    if (r.includes("class") && r.includes("not found")) {
      return "Create the class in ERP or correct the class name.";
    }
    if (r.includes("section") && r.includes("not found")) {
      return "Create the section or correct the section value.";
    }
    if (r.includes("admission") && (r.includes("exists") || r.includes("duplicate"))) {
      return "Use a unique Admission Number or enable Update strategy.";
    }
    if (r.includes("required")) {
      return "Fill in the required mandatory field.";
    }
    return "Verify the field formats and values.";
  };

  const handleDownloadErrorReport = () => {
    if (!previewData) return;
    const errorRows = previewData.rows.filter(r => r.status === "ERROR" || r.status === "WARNING");
    let csvContent = "data:text/csv;charset=utf-8,Excel Row,Admission No,Student Name,Error Message,Suggested Fix\n";
    errorRows.forEach(r => {
      const fix = getSuggestedFix(r.reason);
      csvContent += `${r.rowNumber},"${r.admissionNo || ""}","${r.studentName || ""}","${r.reason || ""}","${fix}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `student_import_errors_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const handleDelete = (id: string, fullName: string) => {
    if (confirm(`Are you sure you want to permanently delete the student "${fullName}"? This will remove all their records (fees, attendance, etc.).`)) {
      startTransition(async () => {
        try {
          await deleteStudentAction(id);
          toast.success("Student deleted successfully");
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to delete student");
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={selectedSessionId}
            onChange={(e) => {
              const nextSessionId = e.target.value;
              setSelectedSessionId(nextSessionId);
              applyFilters(search, nextSessionId, selectedClassId, selectedSectionId);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="" disabled>Select Session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={selectedClassId}
            onChange={(e) => {
              const nextClassId = e.target.value;
              setSelectedClassId(nextClassId);
              setSelectedSectionId("");
              applyFilters(search, selectedSessionId, nextClassId, "");
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select Class</option>
            <option value="ALL">All Students</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedSectionId}
            onChange={(e) => {
              const nextSectionId = e.target.value;
              setSelectedSectionId(nextSectionId);
              applyFilters(search, selectedSessionId, selectedClassId, nextSectionId);
            }}
            disabled={!selectedClassId || selectedClassId === "ALL" || selectedClassId === ""}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="">All Sections</option>
            {activeSections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name}
              </option>
            ))}
          </select>

          <div className="relative flex items-center gap-1.5">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowRecommendations(true);
              }}
              onFocus={() => setShowRecommendations(true)}
              onBlur={() => setTimeout(() => setShowRecommendations(false), 250)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // Immediate fetch on Enter (clears debounce)
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  setShowRecommendations(false);
                  applyFilters(search, selectedSessionId, selectedClassId, selectedSectionId);
                }
              }}
              placeholder="Search by name, adm no, parents, phone…"
              className="w-[280px] h-9"
            />

            <Button
              type="button"
              variant="outline"
              loading={pending}
              onClick={() => {
                setShowRecommendations(false);
                applyFilters(search, selectedSessionId, selectedClassId, selectedSectionId);
              }}
              className="h-9 px-3"
            >
              Search
            </Button>

            {/* Auto-suggest dropdown popup */}
            {showRecommendations && search.trim().length > 0 && (
              <div className="absolute top-10 left-0 w-[280px] bg-white text-stone-900 border border-stone-200 rounded-lg shadow-lg z-50 max-h-[250px] overflow-y-auto scrollbar-thin divide-y">
                {students
                  .filter((s) => {
                    const q = search.toLowerCase();
                    return (
                      s.fullName.toLowerCase().includes(q) ||
                      s.admissionNo.toLowerCase().includes(q) ||
                      s.family?.fatherName?.toLowerCase().includes(q) ||
                      s.family?.motherName?.toLowerCase().includes(q) ||
                      s.family?.primaryPhone?.includes(q) ||
                      s.family?.secondaryPhone?.includes(q)
                    );
                  })
                  .slice(0, 10)
                  .map((s) => (
                    <div
                      key={s.id}
                      onMouseDown={(e) => {
                        // Prevent blur event from firing before navigating
                        e.preventDefault();
                      }}
                      onClick={() => {
                        setShowRecommendations(false);
                        router.push(`/students/${s.id}`);
                      }}
                      className="p-2.5 hover:bg-stone-100 cursor-pointer text-left transition-colors"
                    >
                      <div className="font-semibold text-xs text-stone-850 flex justify-between">
                        <span>{s.fullName}</span>
                        <span className="text-[10px] text-stone-500 font-mono">#{s.admissionNo}</span>
                      </div>
                      {s.family?.fatherName && (
                        <div className="text-[10px] text-stone-500 mt-0.5">
                          S/o or D/o: {s.family.fatherName}
                        </div>
                      )}
                    </div>
                  ))}
                {students.filter((s) => {
                  const q = search.toLowerCase();
                  return (
                    s.fullName.toLowerCase().includes(q) ||
                    s.admissionNo.toLowerCase().includes(q) ||
                    s.family?.fatherName?.toLowerCase().includes(q) ||
                    s.family?.motherName?.toLowerCase().includes(q) ||
                    s.family?.primaryPhone?.includes(q) ||
                    s.family?.secondaryPhone?.includes(q)
                  );
                }).length === 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    No matching student found
                  </div>
                )}
              </div>
            )}
          </div>

          {(search || (selectedClassId && selectedClassId !== "ALL") || selectedSectionId) && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setSearch("");
                setSelectedClassId("ALL");
                setSelectedSectionId("");
                startTransition(() => {
                  router.push("/students");
                });
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>


        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setIsImportModalOpen(true);
              setImportStep("UPLOAD");
              setSelectedFile(null);
              setPreviewData(null);
            }}
          >
            Import XLSX
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={handleExport}
          >
            Export XLSX
          </Button>
        </div>
      </div>

      {!(search.trim() || (selectedSessionId && selectedClassId && selectedClassId !== "")) ? (
        <Card className="border border-dashed border-stone-250 p-8 text-center bg-stone-50/50 rounded-xl shadow-xs">
          <CardContent className="py-8 text-stone-500 space-y-2 flex flex-col items-center">
            <span className="text-3xl block">📁</span>
            <p className="font-semibold text-sm">Select Filters or Search</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Please select Academic Session and Class, or type in the search bar above to display the student list.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={cn("overflow-hidden rounded-lg border bg-card transition-opacity duration-200 relative", pending && "opacity-60 pointer-events-none")}>
          {pending && (
            <div className="absolute inset-0 bg-background/10 backdrop-blur-[0.5px] flex items-center justify-center z-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          <div className="max-h-[850px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left sticky top-0 bg-background z-10">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Admission</th>
                  <th className="px-4 py-3 font-medium">Father's Name</th>
                  <th className="px-4 py-3 font-medium">Phone No.</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {displayedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground font-medium text-sm">
                      No students found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  displayedStudents.map((s) => {
                    const enrollment = s.enrollments[0];
                    return (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-accent/10 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold text-muted-foreground shadow-2xs">
                              {s.photoUrl ? (
                                <img src={s.photoUrl} alt={s.fullName} className="h-full w-full object-cover" />
                              ) : (
                                s.fullName.charAt(0).toUpperCase()
                              )}
                            </div>
                            <span className="font-semibold truncate max-w-[140px] inline-block" title={s.fullName}>
                              {s.fullName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono font-medium">{s.admissionNo}</td>
                        <td className="px-4 py-3">
                          <span className="truncate max-w-[140px] inline-block" title={s.family?.fatherName || ""}>
                            {s.family?.fatherName || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {s.family?.primaryPhone || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {enrollment
                            ? `${enrollment.class.name}-${enrollment.section.name}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={s.status === "ACTIVE" ? "success" : "secondary"}>{s.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end items-center gap-3">
                            <Link href={`/students/${s.id}`} className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline">
                              View
                            </Link>
                            {canDelete && s.id !== currentUserStudentId && (
                              <button
                                onClick={() => handleDelete(s.id, s.fullName)}
                                disabled={pending}
                                className="text-sm font-medium text-red-600 hover:text-red-900 hover:underline disabled:opacity-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-4xl shadow-xl bg-white max-h-[90vh] flex flex-col">
            <CardHeader className="border-b px-6 py-4 flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-lg font-bold text-stone-800">
                {importStep === "UPLOAD" && "Import Students - Select File"}
                {importStep === "PREVIEW" && "Import Students - Validation Preview"}
                {importStep === "RESULT" && "Import Students - Completed"}
              </CardTitle>
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 transition-colors"
                disabled={isAnalyzing || isCommitting}
              >
                ✕
              </button>
            </CardHeader>
             <CardContent className="p-6 overflow-y-auto flex-1 min-h-0 text-sm space-y-4">

              {/* PROGRESS BAR OVERLAY */}
              {importProgress ? (
                <div className="flex flex-col items-center justify-center p-8 space-y-4">
                  <div className="text-stone-700 font-bold text-base">Importing Student Records...</div>
                  <div className="w-full max-w-md bg-stone-100 rounded-full h-4 overflow-hidden relative">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${(importProgress.processed / importProgress.total) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-stone-500 font-mono">
                    Processed {importProgress.processed} / {importProgress.total} records ({importProgress.remaining} remaining)
                  </div>
                  {importProgress.currentName && (
                    <div className="text-xs text-stone-455 italic">
                      Current student: {importProgress.currentName}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* STEP 1: WELCOME & INSTRUCTIONS */}
                  {importStep === "WIZARD_START" && (
                    <div className="space-y-5 py-2">
                      <div className="bg-stone-50 border border-stone-200 rounded-lg p-5 space-y-3">
                        <h3 className="font-bold text-stone-800 text-sm">Welcome to the Student Import Wizard</h3>
                        <p className="text-xs text-stone-650 leading-relaxed">
                          This wizard guides you through importing student records in bulk.
                        </p>
                        <div className="space-y-1.5 pt-2">
                          <h4 className="text-xs font-bold text-stone-700">Important Instructions:</h4>
                          <ul className="list-disc list-inside text-xs text-stone-500 space-y-1 pl-1">
                            <li>Only the following fields are mandatory: <strong className="text-stone-700">Admission Number</strong>, <strong className="text-stone-700">Student Name</strong>, <strong className="text-stone-700">Class</strong>, and <strong className="text-stone-700">Section</strong>.</li>
                            <li>Every other field is optional and can be left blank.</li>
                            <li>Classes and Sections must match existing records in the ERP. Classes (e.g. roman numerals like <code className="bg-stone-100 px-1 py-0.5 rounded text-[10px]">XII</code> or values like <code className="bg-stone-100 px-1 py-0.5 rounded text-[10px]">Class 12</code>) are mapped automatically.</li>
                            <li>Duplicate Admission Numbers will be checked against the ERP database.</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg bg-stone-50/30 gap-3">
                        <p className="text-xs text-stone-500 font-medium">Download the dynamic template containing all form fields:</p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleDownloadSample}
                          className="flex items-center gap-1.5"
                        >
                          📥 Download Sample Template
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: UPLOAD & SETTINGS */}
                  {importStep === "UPLOAD" && (
                    <div className="space-y-6">
                      <div className="border-2 border-dashed border-stone-200 rounded-xl p-8 text-center bg-stone-50/50 hover:bg-stone-50 transition-colors flex flex-col items-center justify-center gap-3">
                        <span className="text-4xl">📁</span>
                        <div>
                          <p className="font-semibold text-stone-700">Choose Student Excel File</p>
                          <p className="text-xs text-stone-450 mt-1">Supports .xlsx and .xls formats</p>
                        </div>

                        <input
                          type="file"
                          id="excel-upload-file"
                          accept=".xlsx,.xls"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadAndAnalyze(file);
                            e.target.value = "";
                          }}
                        />

                        <Button
                          type="button"
                          onClick={() => document.getElementById("excel-upload-file")?.click()}
                          loading={isAnalyzing}
                          className="mt-2"
                        >
                          {isAnalyzing ? "Analyzing File..." : "Browse File"}
                        </Button>
                      </div>

                      <div className="bg-stone-50 border border-stone-150 rounded-lg p-4 space-y-3">
                        <h4 className="font-semibold text-stone-800 text-xs uppercase tracking-wider">Configure Import Settings</h4>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-stone-500">Duplicate Handling Strategy</label>
                            <select
                              value={duplicateStrategy}
                              onChange={(e) => setDuplicateStrategy(e.target.value as "SKIP" | "UPDATE" | "FAIL")}
                              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none"
                            >
                              <option value="SKIP">Skip Existing Student (Import Only Unique Students)</option>
                              <option value="UPDATE">Update Existing Record (Overwrite Details)</option>
                              <option value="FAIL">Fail Import (Reject File on Any Duplicate)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: VALIDATION PREVIEW */}
                  {importStep === "PREVIEW" && previewData && (
                    <div className="space-y-4 flex flex-col h-full min-h-0">
                      {/* Summary Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 shrink-0">
                        <div className="bg-stone-50 border p-2.5 rounded-lg text-center">
                          <span className="text-[9px] uppercase font-bold text-stone-400 block mb-0.5">Total Rows</span>
                          <span className="text-base font-extrabold text-stone-700">{previewData.summary.total}</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg text-center">
                          <span className="text-[9px] uppercase font-bold text-emerald-600 block mb-0.5">✓ Valid</span>
                          <span className="text-base font-extrabold text-emerald-700">{previewData.summary.ready}</span>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 p-2.5 rounded-lg text-center">
                          <span className="text-[9px] uppercase font-bold text-rose-600 block mb-0.5">✗ Invalid</span>
                          <span className="text-base font-extrabold text-rose-700">{previewData.summary.errors}</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 p-2.5 rounded-lg text-center">
                          <span className="text-[9px] uppercase font-bold text-amber-600 block mb-0.5">⚠ Duplicates</span>
                          <span className="text-base font-extrabold text-amber-700">{previewData.summary.duplicates ?? 0}</span>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 p-2.5 rounded-lg text-center">
                          <span className="text-[9px] uppercase font-bold text-blue-600 block mb-0.5">Missing Fields</span>
                          <span className="text-base font-extrabold text-blue-700">{previewData.summary.missingRequired ?? 0}</span>
                        </div>
                        <div className="bg-violet-50 border border-violet-100 p-2.5 rounded-lg text-center">
                          <span className="text-[9px] uppercase font-bold text-violet-600 block mb-0.5">Bad Class</span>
                          <span className="text-base font-extrabold text-violet-700">{previewData.summary.unknownClasses ?? 0}</span>
                        </div>
                        <div className="bg-purple-50 border border-purple-100 p-2.5 rounded-lg text-center">
                          <span className="text-[9px] uppercase font-bold text-purple-600 block mb-0.5">Bad Section</span>
                          <span className="text-base font-extrabold text-purple-700">{previewData.summary.unknownSections ?? 0}</span>
                        </div>
                        <div className="bg-red-50 border border-red-100 p-2.5 rounded-lg text-center">
                          <span className="text-[9px] uppercase font-bold text-red-600 block mb-0.5">Missing Fee Struct</span>
                          <span className="text-base font-extrabold text-red-700">{previewData.summary.missingFeeStructures ?? 0}</span>
                        </div>
                      </div>

                      {/* Filter tabs + Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 border-b pb-3">
                        <div className="flex gap-1">
                          {(["ALL", "READY", "WARNING", "ERROR"] as const).map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setPreviewFilter(tab)}
                              className={cn(
                                "px-3 py-1 rounded-md text-xs font-semibold border transition-all",
                                previewFilter === tab
                                  ? "bg-stone-800 text-white border-stone-800"
                                  : "bg-white text-stone-600 hover:bg-stone-50 border-stone-200"
                              )}
                            >
                              {tab === "ALL" && `All Rows (${previewData.summary.total})`}
                              {tab === "READY" && `Ready (${previewData.summary.ready})`}
                              {tab === "WARNING" && `Warnings (${previewData.summary.warnings})`}
                              {tab === "ERROR" && `Errors (${previewData.summary.errors})`}
                            </button>
                          ))}
                        </div>

                        {(previewData.summary.errors > 0 || previewData.summary.warnings > 0) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadErrorReport}
                            className="text-xs h-8 text-rose-600 border-rose-200 hover:bg-rose-50/50"
                          >
                            🚨 Download Error Report
                          </Button>
                        )}
                      </div>

                      {/* Preview Table */}
                      <div className="overflow-auto border rounded-lg flex-1 min-h-[250px]">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-stone-50 border-b sticky top-0 bg-stone-50 z-10 font-bold text-stone-600">
                            <tr>
                              <th className="px-3 py-2.5 w-16 text-center">Row</th>
                              <th className="px-3 py-2.5">Admission No</th>
                              <th className="px-3 py-2.5">Name</th>
                              <th className="px-3 py-2.5 w-44">Class / Section</th>
                              <th className="px-3 py-2.5 w-44">Gender / Category</th>
                              <th className="px-3 py-2.5 w-24">Status</th>
                              <th className="px-3 py-2.5">Validation Details / Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {previewData.rows
                              .filter(r => {
                                if (previewFilter === "ALL") return true;
                                return r.status === previewFilter;
                              })
                              .map((row, idx) => (
                                <tr key={idx} className="hover:bg-stone-50/50 transition-colors">
                                  <td className="px-3 py-2.5 text-center font-mono font-bold text-stone-450">{row.rowNumber}</td>
                                  <td className="px-3 py-2.5 font-mono font-semibold">{row.admissionNo || "—"}</td>
                                  <td className="px-3 py-2.5 font-bold text-stone-800">{row.studentName || "—"}</td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex flex-col gap-0.5 text-stone-700">
                                      <span className="font-semibold">{row.className || "—"}</span>
                                      <span className="text-stone-400 text-[10px]">Section: {row.sectionName || "—"}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex flex-col gap-0.5 text-stone-700">
                                      <span className="capitalize">{(row.data.gender || "—").toLowerCase()}</span>
                                      <span className="text-stone-400 text-[10px] capitalize">{(row.data.category || "—").toLowerCase()}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <Badge
                                      variant={
                                        row.status === "READY"
                                          ? "success"
                                          : row.status === "WARNING"
                                            ? "warning"
                                            : "destructive"
                                      }
                                      className="text-[9px] px-1.5 py-0.5"
                                    >
                                      {row.status}
                                    </Badge>
                                  </td>
                                  <td className={cn(
                                    "px-3 py-2.5 text-stone-500",
                                    row.status === "ERROR" && "text-rose-600 font-medium",
                                    row.status === "WARNING" && "text-amber-600"
                                  )}>
                                    {row.reason}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>

                      {previewData.summary.errors > 0 && (
                        <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-rose-700 text-xs shrink-0 flex items-start gap-2">
                          <span className="text-lg leading-none">⚠️</span>
                          <p>
                            <strong>Errors detected:</strong> You can fix class, section, gender, or category options directly in the dropdown inputs above to resolve error issues. The import is blocked until errors are resolved.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 4: RESULT SUMMARY */}
                  {importStep === "RESULT" && executionResult && (
                    <div className="space-y-6 text-center py-6">
                      <div className="text-4xl">🎉</div>
                      <h3 className="text-lg font-bold text-stone-800">Import Job Processed</h3>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-lg mx-auto text-center">
                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                          <span className="text-xs font-bold text-emerald-600 block mb-1">Imported</span>
                          <span className="text-3xl font-extrabold text-emerald-700">{executionResult.imported}</span>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                          <span className="text-xs font-bold text-indigo-600 block mb-1">Updated</span>
                          <span className="text-3xl font-extrabold text-indigo-700">{executionResult.updated}</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl">
                          <span className="text-xs font-bold text-amber-600 block mb-1">Skipped</span>
                          <span className="text-3xl font-extrabold text-amber-700">{executionResult.skipped}</span>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl">
                          <span className="text-xs font-bold text-rose-600 block mb-1">Failed</span>
                          <span className="text-3xl font-extrabold text-rose-700">{executionResult.failed}</span>
                        </div>
                      </div>

                      {executionResult.failed > 0 && (
                        <div className="pt-2">
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDownloadErrorReport}
                            className="flex items-center gap-1.5 mx-auto"
                          >
                            🚨 Download Error Report
                          </Button>
                        </div>
                      )}

                      <p className="text-stone-500 text-xs max-w-sm mx-auto">
                        All processed records were committed atomically under a single database transaction. Audit logs have been generated.
                      </p>
                    </div>
                  )}
                </>
              )}

            </CardContent>

            <CardFooter className="border-t px-6 py-4 flex justify-between shrink-0 bg-stone-50/50 rounded-b-xl">
              {importProgress ? (
                <span className="text-xs text-stone-400 font-mono">Importing progress... Please do not close this window.</span>
              ) : (
                <>
                  {importStep === "WIZARD_START" && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setIsImportModalOpen(false)}
                      >
                        Cancel
                      </Button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-450 mr-2">Step 1 of 4</span>
                        <Button
                          type="button"
                          onClick={() => setImportStep("UPLOAD")}
                        >
                          Continue to Upload
                        </Button>
                      </div>
                    </>
                  )}

                  {importStep === "UPLOAD" && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setImportStep("WIZARD_START")}
                        disabled={isAnalyzing}
                      >
                        Back
                      </Button>
                      <span className="text-xs text-stone-400">Step 2 of 4</span>
                    </>
                  )}

                  {importStep === "PREVIEW" && previewData && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setImportStep("UPLOAD")}
                        disabled={isCommitting}
                      >
                        Back to Upload
                      </Button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-400 mr-2">Step 3 of 4</span>
                        <Button
                          type="button"
                          onClick={handleConfirmImport}
                          loading={isCommitting}
                          disabled={previewData.summary.errors > 0}
                        >
                          {isCommitting ? "Importing Batch..." : `Confirm & Import (${previewData.summary.ready} Students)`}
                        </Button>
                      </div>
                    </>
                  )}

                  {importStep === "RESULT" && (
                    <>
                      <span />
                      <Button
                        type="button"
                        onClick={() => setIsImportModalOpen(false)}
                      >
                        Done & Close
                      </Button>
                    </>
                  )}
                </>
              )}
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}

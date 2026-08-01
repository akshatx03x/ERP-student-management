"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import {
  deleteStudentAction,
  exportStudentsAction,
  importStudentsAction,
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
        s.family?.primaryPhone?.includes(q)
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

  const handleImportFile = (file: File | null) => {
    if (!file) return;
    startTransition(async () => {
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 1) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const base64 = btoa(binary);
        const result = await importStudentsAction(base64);
        
        setImportResult(result);
        if (result.failCount === 0) {
          toast.success(`Successfully imported ${result.successCount} students!`);
        } else {
          toast.warning(`Imported ${result.successCount} students. ${result.failCount} rows failed.`);
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to import students");
      }
    });
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
                      s.family?.primaryPhone?.includes(q)
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
                    s.family?.primaryPhone?.includes(q)
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
          <input
            type="file"
            id="student-import-file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              handleImportFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => document.getElementById("student-import-file")?.click()}
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

      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg shadow-lg">
            <CardHeader className="border-b">
              <CardTitle>Import Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5 text-sm">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3">
                  <span className="text-xs uppercase font-medium text-emerald-600 block mb-1">Successfully Imported</span>
                  <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{importResult.successCount}</span>
                </div>
                <div className={`rounded-lg p-3 ${importResult.failCount > 0 ? "bg-rose-50 dark:bg-rose-950/20" : "bg-muted/40"}`}>
                  <span className="text-xs uppercase font-medium text-rose-600 block mb-1">Failed Rows</span>
                  <span className={`text-2xl font-bold ${importResult.failCount > 0 ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"}`}>{importResult.failCount}</span>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Error Details</span>
                  <div className="max-h-48 overflow-y-auto rounded-md border p-3 bg-slate-50 dark:bg-slate-900/30 text-rose-600 space-y-1.5 font-mono text-xs">
                    {importResult.errors.map((err, idx) => (
                      <div key={idx} className="border-b last:border-0 pb-1.5 last:pb-0">
                        <span className="font-bold text-foreground">Row {err.row}:</span> {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t">
                <Button type="button" onClick={() => setImportResult(null)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

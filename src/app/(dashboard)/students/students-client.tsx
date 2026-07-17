"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

export function StudentsClient({
  students,
  initialSearch,
  canDelete,
  currentUserStudentId,
  classes,
  initialClassId,
  initialSectionId,
}: {
  students: StudentRow[];
  initialSearch: string;
  canDelete: boolean;
  currentUserStudentId?: string;
  classes: ClassRow[];
  initialClassId: string;
  initialSectionId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const [selectedSectionId, setSelectedSectionId] = useState(initialSectionId);
  const [pending, startTransition] = useTransition();

  const [importResult, setImportResult] = useState<{
    successCount: number;
    failCount: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  const activeClass = classes.find((c) => c.id === selectedClassId);
  const activeSections = activeClass?.sections ?? [];

  const applyFilters = (searchVal: string, classIdVal: string, sectionIdVal: string) => {
    const params = new URLSearchParams();
    if (searchVal.trim()) params.set("q", searchVal.trim());
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
        });
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyFilters(search, selectedClassId, selectedSectionId);
              }
            }}
            placeholder="Search by name or admission no…"
            className="max-w-xs"
          />

          <select
            value={selectedClassId}
            onChange={(e) => {
              const nextClassId = e.target.value;
              setSelectedClassId(nextClassId);
              setSelectedSectionId("");
              applyFilters(search, nextClassId, "");
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All Classes</option>
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
              applyFilters(search, selectedClassId, nextSectionId);
            }}
            disabled={!selectedClassId}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="">All Sections</option>
            {activeSections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name}
              </option>
            ))}
          </select>

          <Button
            type="button"
            variant="outline"
            loading={pending}
            onClick={() => applyFilters(search, selectedClassId, selectedSectionId)}
          >
            Search
          </Button>

          {(search || selectedClassId || selectedSectionId) && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setSearch("");
                setSelectedClassId("");
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

      <div className={cn("overflow-hidden rounded-lg border bg-card transition-opacity duration-200 relative", pending && "opacity-60 pointer-events-none")}>
        {pending && (
          <div className="absolute inset-0 bg-background/10 backdrop-blur-[0.5px] flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <table className="w-full text-sm">

          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Admission</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Parents</th>
              <th className="px-4 py-3 font-medium">Class</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const enrollment = s.enrollments[0];
              const parents = s.family
                ? [s.family.fatherName, s.family.motherName].filter(Boolean).join(" · ") || "—"
                : "—";
              return (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{s.admissionNo}</td>
                  <td className="px-4 py-3">{s.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{parents}</td>
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
            })}
          </tbody>
        </table>
      </div>

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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { deleteStudentAction } from "@/server/actions/student.actions";

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

  const activeClass = classes.find((c) => c.id === selectedClassId);
  const activeSections = activeClass?.sections ?? [];

  const applyFilters = (searchVal: string, classIdVal: string, sectionIdVal: string) => {
    const params = new URLSearchParams();
    if (searchVal.trim()) params.set("q", searchVal.trim());
    if (classIdVal) params.set("classId", classIdVal);
    if (sectionIdVal) params.set("sectionId", sectionIdVal);
    
    const queryStr = params.toString();
    router.push(queryStr ? `/students?${queryStr}` : "/students");
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
          onClick={() => applyFilters(search, selectedClassId, selectedSectionId)}
        >
          Search
        </Button>

        {(search || selectedClassId || selectedSectionId) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setSelectedClassId("");
              setSelectedSectionId("");
              router.push("/students");
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
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
    </div>
  );
}

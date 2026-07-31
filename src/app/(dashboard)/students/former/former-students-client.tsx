"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { cancelStudentExitAction } from "@/server/actions/student-exit.actions";

type FormerStudent = {
  id: string;
  admissionNo: string;
  fullName: string;
  photoUrl?: string | null;
  dateOfBirth: Date | string;
  gender?: string | null;
  status: string;
  family?: {
    fatherName?: string | null;
    motherName?: string | null;
    primaryPhone?: string | null;
  } | null;
  exitInfo?: {
    leavingDate: Date | string;
    reason: string;
    tcNumber?: string | null;
    tcDate?: Date | string | null;
    remarks?: string | null;
  } | null;
  enrollments: Array<{
    class: { name: string };
    section: { name: string };
    session: { name: string };
  }>;
};

export function FormerStudentsClient({
  students,
}: {
  students: FormerStudent[];
}) {
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("ALL");

  function handleReactivate(studentId: string, studentName: string) {
    if (!confirm(`Are you sure you want to re-activate ${studentName}? This will restore their active status and enrollment.`)) return;

    startTransition(async () => {
      const res = await cancelStudentExitAction(studentId);
      if (res.success) {
        toast.success(`Successfully re-activated ${studentName}`);
      } else {
        toast.error(res.error || "Failed to re-activate student");
      }
    });
  }

  const filtered = students.filter((s) => {
    if (reasonFilter !== "ALL" && s.exitInfo?.reason !== reasonFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchName = s.fullName.toLowerCase().includes(q);
      const matchAdm = s.admissionNo.toLowerCase().includes(q);
      const matchTc = s.exitInfo?.tcNumber?.toLowerCase().includes(q);
      return matchName || matchAdm || matchTc;
    }
    return true;
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b">
        <div>
          <CardTitle className="text-lg font-bold">Former Students</CardTitle>
          <p className="text-xs text-muted-foreground">
            Archive of students who have left the school (Transferred, Withdrawn, or Expelled). Past history remains accessible.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search student or TC no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-60 h-8 text-xs"
          />
          <div className="inline-flex rounded-md border bg-muted/50 p-0.5 text-xs">
            {["ALL", "TRANSFERRED", "WITHDRAWN", "EXPELLED"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReasonFilter(r)}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  reasonFilter === r ? "bg-background text-foreground shadow-xs font-bold" : "text-muted-foreground"
                }`}
              >
                {r === "ALL" ? "All" : r.charAt(0) + r.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No former student records found matching the filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground uppercase text-[10px] font-semibold">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Adm No</th>
                  <th className="px-4 py-3">Leaving Date</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">TC Number</th>
                  <th className="px-4 py-3">Last Class</th>
                  <th className="px-4 py-3">Remarks</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((s) => {
                  const lastEnr = s.enrollments[0];
                  return (
                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-bold text-muted-foreground">
                            {s.photoUrl ? (
                              <img src={s.photoUrl} alt={s.fullName} className="h-full w-full object-cover" />
                            ) : (
                              s.fullName.charAt(0)
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{s.fullName}</p>
                            {s.family?.primaryPhone && (
                              <p className="text-[10px] text-muted-foreground">{s.family.primaryPhone}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium">{s.admissionNo}</td>
                      <td className="px-4 py-3">
                        {s.exitInfo?.leavingDate ? formatDate(s.exitInfo.leavingDate) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                          {s.exitInfo?.reason || "LEFT"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {s.exitInfo?.tcNumber || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {lastEnr ? `${lastEnr.class.name}-${lastEnr.section.name} (${lastEnr.session.name})` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                        {s.exitInfo?.remarks || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            className="h-7 text-[11px] px-2 text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                            onClick={() => handleReactivate(s.id, s.fullName)}
                          >
                            Re-activate
                          </Button>
                          <Link
                            href={`/students/${s.id}`}
                            className="inline-flex items-center gap-1 rounded bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                          >
                            View Profile
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

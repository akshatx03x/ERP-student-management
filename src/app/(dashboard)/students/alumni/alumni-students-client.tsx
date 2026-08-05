"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { cancelStudentExitAction } from "@/server/actions/student-exit.actions";

type AlumniStudent = {
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
    secondaryPhone?: string | null;
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

export function AlumniStudentsClient({
  students,
}: {
  students: AlumniStudent[];
}) {
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

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
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchName = s.fullName.toLowerCase().includes(q);
      const matchAdm = s.admissionNo.toLowerCase().includes(q);
      const matchFather = s.family?.fatherName?.toLowerCase().includes(q);
      const matchMother = s.family?.motherName?.toLowerCase().includes(q);
      const matchPhone = s.family?.primaryPhone?.includes(q) || s.family?.secondaryPhone?.includes(q);
      return matchName || matchAdm || matchFather || matchMother || matchPhone;
    }
    return true;
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b">
        <div>
          <CardTitle className="text-lg font-bold">School Alumni</CardTitle>
          <p className="text-xs text-muted-foreground">
            Directory of students who successfully completed their education and graduated from the school.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search name, adm no, parents, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 h-8 text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No alumni records found matching the search.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-stone-200 rounded-lg scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground uppercase text-[10px] font-semibold">
                  <th className="px-4 py-3">Alumni Name</th>
                  <th className="px-4 py-3">Adm No</th>
                  <th className="px-4 py-3">Graduation Date</th>
                  <th className="px-4 py-3">Final Class / Session</th>
                  <th className="px-4 py-3">TC Number</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((s) => {
                  const lastEnr = s.enrollments[0];
                  return (
                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-emerald-100 text-emerald-800 font-bold text-xs">
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
                        {lastEnr ? `${lastEnr.class.name}-${lastEnr.section.name} (${lastEnr.session.name})` : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {s.exitInfo?.tcNumber || "—"}
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
                            <Eye className="w-3.5 h-3.5" /> View Profile
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

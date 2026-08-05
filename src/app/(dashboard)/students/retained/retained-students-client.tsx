"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Eye } from "lucide-react";

type RetainedStudent = {
  id: string;
  admissionNo: string;
  fullName: string;
  photoUrl?: string | null;
  dateOfBirth?: Date | string | null;
  gender?: string | null;
  status: string;
  family?: {
    fatherName?: string | null;
    motherName?: string | null;
    primaryPhone?: string | null;
    secondaryPhone?: string | null;
  } | null;
  enrollments: Array<{
    class: { id: string; name: string };
    section: { name: string };
    session: { id: string; name: string };
    status: string;
  }>;
};

type SessionRow = {
  id: string;
  name: string;
};

type ClassRow = {
  id: string;
  name: string;
};

export function RetainedStudentsClient({
  students,
  sessions,
  classes,
}: {
  students: RetainedStudent[];
  sessions: SessionRow[];
  classes: ClassRow[];
}) {
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string>("ALL");
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");

  const filtered = students.filter((s) => {
    // Session & Class filter
    const hasRetainedEnrollmentMatching = s.enrollments.some((e) => {
      const isRetained = e.status === "RETAINED";
      const sessionMatch = selectedSessionId === "ALL" || e.session.id === selectedSessionId;
      const classMatch = selectedClassId === "ALL" || e.class.id === selectedClassId;
      return isRetained && sessionMatch && classMatch;
    });

    if (!hasRetainedEnrollmentMatching) return false;

    // Search filter
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
    <Card className="shadow-sm border border-stone-200 rounded-2xl overflow-hidden bg-card">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b">
        <div>
          <CardTitle className="text-lg font-bold text-stone-900">Retained Students</CardTitle>
          <p className="text-xs text-muted-foreground">
            Directory of active students who have been retained in their class and did not promote to the next grade level.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            placeholder="Search name, admission no, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 h-9 text-xs"
          />
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="ALL">All Retained Sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="ALL">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="pt-4 px-0 pb-0">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No retained student records found matching the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[1100px] overflow-y-auto border-t border-stone-100 scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b bg-stone-50/75 text-stone-500 uppercase text-[10px] font-semibold tracking-wider">
                  <th className="px-5 py-3.5">Student Info</th>
                  <th className="px-5 py-3.5">Adm No</th>
                  <th className="px-5 py-3.5">{"Father's Name"}</th>
                  <th className="px-5 py-3.5">Current Class</th>
                  <th className="px-5 py-3.5">Retained Session</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((s) => {
                  // Find first enrollment that is retained, or fallback to latest
                  const retainedEnr = s.enrollments.find((e) => e.status === "RETAINED") || s.enrollments[0];
                  return (
                    <tr key={s.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium">
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-8.5 w-8.5 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-stone-100 text-xs font-bold text-stone-600">
                            {s.photoUrl ? (
                              <img src={s.photoUrl} alt={s.fullName} className="h-full w-full object-cover" />
                            ) : (
                              s.fullName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-stone-850 text-sm">{s.fullName}</p>
                            {s.family?.primaryPhone && (
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{s.family.primaryPhone}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono font-semibold text-stone-700">{s.admissionNo}</td>
                      <td className="px-5 py-3.5 text-stone-600 font-medium">
                        {s.family?.fatherName || "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        {retainedEnr ? (
                          <span className="font-semibold text-stone-850">
                            {retainedEnr.class.name}-{retainedEnr.section.name}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {retainedEnr?.session?.name ? (
                          <Badge variant="secondary" className="text-[10px] uppercase font-bold text-stone-700 bg-stone-100 border border-stone-200">
                            {retainedEnr.session.name}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/students/${s.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 hover:bg-stone-200/70 border border-stone-200 px-3 py-1.5 text-[11px] font-semibold text-stone-700 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Profile
                        </Link>
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

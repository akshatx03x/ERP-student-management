"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

export function StudentsClient({
  students,
  initialSearch,
}: {
  students: StudentRow[];
  initialSearch: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or admission no…"
          className="max-w-sm"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(search ? `/students?q=${encodeURIComponent(search)}` : "/students")
          }
        >
          Search
        </Button>
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
                    <Link href={`/students/${s.id}`} className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline">
                      View
                    </Link>
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteFamilyAction } from "@/server/actions/family.actions";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type FamilyRow = {
  id: string;
  fatherName: string | null;
  motherName: string | null;
  guardianName: string | null;
  primaryPhone: string | null;
  childrenCount: number;
  students: Array<{ id: string; fullName: string; admissionNo: string }>;
};

function parentsLabel(f: {
  fatherName: string | null;
  motherName: string | null;
  guardianName: string | null;
}) {
  return [f.fatherName, f.motherName, f.guardianName].filter(Boolean).join(" · ") || "—";
}

export function FamiliesClient({
  families,
  initialSearch,
}: {
  families: FamilyRow[];
  initialSearch: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by parent name or mobile…"
          className="max-w-sm"
        />
        <Button
          type="button"
          variant="outline"
          loading={pending}
          onClick={() =>
            startTransition(() => {
              router.push(search ? `/families?q=${encodeURIComponent(search)}` : "/families");
            })
          }
        >
          Search
        </Button>
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
              <th className="px-4 py-3 font-medium">Parents / Guardian</th>
              <th className="px-4 py-3 font-medium">Mobile</th>
              <th className="px-4 py-3 font-medium">Students</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {families.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No families yet. They appear when you add or admit students.
                </td>
              </tr>
            ) : (
              families.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{parentsLabel(f)}</td>
                  <td className="px-4 py-3">{f.primaryPhone || "—"}</td>
                  <td className="px-4 py-3">
                    {f.students.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {f.students.map((s) => (
                          <div key={s.id}>
                            <Link
                              href={`/students/${s.id}`}
                              className="font-medium text-slate-700 hover:text-slate-900 hover:underline"
                            >
                              {s.fullName}
                            </Link>
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {s.admissionNo}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/families/${f.id}`} className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline">
                      View
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-2 text-red-600 hover:text-red-900 hover:bg-red-50 dark:hover:bg-red-950/20"
                      disabled={pending}
                      onClick={() => {
                        const familyName = parentsLabel(f);
                        let confirmMsg = `Are you sure you want to permanently delete the family "${familyName}"?`;
                        if (f.students.length > 0) {
                          confirmMsg += `\n\nWARNING: The following child(ren) associated with this parent will also be deleted:\n• ${f.students.map((s) => s.fullName).join("\n• ")}\n\nThis will remove all their records (attendance, enrollments, etc.).`;
                        }
                        if (confirm(confirmMsg)) {
                          startTransition(async () => {
                            try {
                              await deleteFamilyAction(f.id);
                              toast.success("Family deleted");
                              router.refresh();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Failed to delete family");
                            }
                          });
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


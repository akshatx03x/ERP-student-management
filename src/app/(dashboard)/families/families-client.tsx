"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteFamilyAction } from "@/server/actions/family.actions";

type FamilyRow = {
  id: string;
  fatherName: string | null;
  motherName: string | null;
  guardianName: string | null;
  primaryPhone: string | null;
  childrenCount: number;
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
          onClick={() =>
            router.push(search ? `/families?q=${encodeURIComponent(search)}` : "/families")
          }
        >
          Search
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
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
                  <td className="px-4 py-3">{f.childrenCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/families/${f.id}`} className="text-primary hover:underline">
                      View
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-2"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await deleteFamilyAction(f.id);
                            toast.success("Family deleted");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          }
                        })
                      }
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

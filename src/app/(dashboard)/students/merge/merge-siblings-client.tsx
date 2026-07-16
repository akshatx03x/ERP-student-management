"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mergeSiblingsAction } from "@/server/actions/student.actions";
import { cn } from "@/lib/utils";

type StudentRow = {
  id: string;
  fullName: string;
  admissionNo: string;
  familyId: string;
  family: {
    fatherName: string | null;
    motherName: string | null;
    primaryPhone: string | null;
  } | null;
};

export function MergeSiblingsClient({ students }: { students: StudentRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [primaryId, setPrimaryId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const primary = useMemo(
    () => students.find((s) => s.id === primaryId) ?? null,
    [students, primaryId],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function merge() {
    if (!primaryId) {
      toast.error("Choose the student whose parent details to keep");
      return;
    }
    const siblings = Array.from(selected).filter((id) => id !== primaryId);
    if (siblings.length === 0) {
      toast.error("Select at least one other student to link as a sibling");
      return;
    }

    startTransition(async () => {
      try {
        const result = await mergeSiblingsAction({
          primaryStudentId: primaryId,
          siblingStudentIds: siblings,
        });
        toast.success("Students linked under the same parent");
        router.push(`/families/${result.familyId}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Link href="/students" className={cn(buttonVariants({ variant: "ghost" }))}>
        Back
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>1. Keep this student&apos;s parent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Pick the student whose parent/family record should remain. Other selected students
            will be moved under the same parent.
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {students.map((s) => {
              const parents = s.family
                ? [s.family.fatherName, s.family.motherName].filter(Boolean).join(" · ") || "—"
                : "—";
              return (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <input
                    type="radio"
                    name="primary"
                    checked={primaryId === s.id}
                    onChange={() => setPrimaryId(s.id)}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="font-medium">{s.fullName}</span>
                    <span className="text-muted-foreground"> ({s.admissionNo})</span>
                    <br />
                    <span className="text-muted-foreground">Parents: {parents}</span>
                    {s.family?.primaryPhone ? (
                      <span className="text-muted-foreground"> · {s.family.primaryPhone}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Link these siblings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Select other students who share the same parent.
            {primary ? (
              <>
                {" "}
                They will join{" "}
                <span className="font-medium text-foreground">{primary.fullName}</span>&apos;s
                family.
              </>
            ) : null}
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {students
              .filter((s) => s.id !== primaryId)
              .map((s) => {
                const parents = s.family
                  ? [s.family.fatherName, s.family.motherName].filter(Boolean).join(" · ") || "—"
                  : "—";
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      className="mt-1"
                    />
                    <span className="text-sm">
                      <span className="font-medium">{s.fullName}</span>
                      <span className="text-muted-foreground"> ({s.admissionNo})</span>
                      <br />
                      <span className="text-muted-foreground">Parents: {parents}</span>
                    </span>
                  </label>
                );
              })}
          </div>
        </CardContent>
      </Card>

      <Button type="button" disabled={pending || !primaryId || selected.size === 0} onClick={merge}>
        Merge under same parent
      </Button>
    </div>
  );
}

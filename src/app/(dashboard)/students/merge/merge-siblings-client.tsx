"use client";

import Link from "next/link";
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { mergeSiblingsAction, listStudentsAction } from "@/server/actions/student.actions";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function MergeSiblingsClient({ classes = [] }: { classes?: any[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Search and class states for Section 1
  const [search1, setSearch1] = useState("");
  const [debouncedSearch1, setDebouncedSearch1] = useState("");
  const [classId1, setClassId1] = useState("");
  const [results1, setResults1] = useState<any[]>([]);
  const [loading1, setLoading1] = useState(false);
  const [primaryStudent, setPrimaryStudent] = useState<any | null>(null);

  // Search and class states for Section 2
  const [search2, setSearch2] = useState("");
  const [debouncedSearch2, setDebouncedSearch2] = useState("");
  const [classId2, setClassId2] = useState("");
  const [results2, setResults2] = useState<any[]>([]);
  const [loading2, setLoading2] = useState(false);
  const [selectedSiblings, setSelectedSiblings] = useState<Record<string, any>>({});

  // Debouncing Search 1
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch1(search1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search1]);

  // Debouncing Search 2
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch2(search2);
    }, 400);
    return () => clearTimeout(handler);
  }, [search2]);

  // Fetch results for Section 1
  useEffect(() => {
    if (!debouncedSearch1.trim() && !classId1) {
      setResults1([]);
      return;
    }
    setLoading1(true);
    listStudentsAction({
      search: debouncedSearch1 || undefined,
      classId: classId1 || undefined,
      pageSize: 50,
    })
      .then((res) => {
        setResults1(res.items);
      })
      .catch(() => {
        toast.error("Failed to search students");
      })
      .finally(() => {
        setLoading1(false);
      });
  }, [debouncedSearch1, classId1]);

  // Fetch results for Section 2
  useEffect(() => {
    if (!debouncedSearch2.trim() && !classId2) {
      setResults2([]);
      return;
    }
    setLoading2(true);
    listStudentsAction({
      search: debouncedSearch2 || undefined,
      classId: classId2 || undefined,
      pageSize: 50,
    })
      .then((res) => {
        setResults2(res.items);
      })
      .catch(() => {
        toast.error("Failed to search students");
      })
      .finally(() => {
        setLoading2(false);
      });
  }, [debouncedSearch2, classId2]);

  function toggleSibling(student: any) {
    setSelectedSiblings((prev) => {
      const next = { ...prev };
      if (next[student.id]) {
        delete next[student.id];
      } else {
        next[student.id] = student;
      }
      return next;
    });
  }

  function merge() {
    if (!primaryStudent) {
      toast.error("Choose the student whose parent details to keep");
      return;
    }
    const siblings = Object.keys(selectedSiblings).filter((id) => id !== primaryStudent.id);
    if (siblings.length === 0) {
      toast.error("Select at least one other student to link as a sibling");
      return;
    }

    startTransition(async () => {
      try {
        const result = await mergeSiblingsAction({
          primaryStudentId: primaryStudent.id,
          siblingStudentIds: siblings,
        });
        toast.success("Students linked under the same parent");
        router.push(`/students/${primaryStudent.id}/details`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  const renderStudentDetails = (s: any) => {
    const enrollment = s.enrollments?.[0];
    const className = enrollment?.class?.name || "—";
    const sectionName = enrollment?.section?.name || "—";
    const classSection = className !== "—" ? `${className} - ${sectionName}` : "—";

    const father = s.family?.fatherName || "—";
    const mother = s.family?.motherName || "—";
    const phone1 = s.family?.primaryPhone;
    const phone2 = s.family?.secondaryPhone;
    const phones = [phone1, phone2].filter(Boolean).join(" / ") || "—";

    return (
      <span className="text-sm text-stone-850">
        <span className="font-semibold text-stone-900">{s.fullName}</span>
        <span className="text-muted-foreground font-medium"> ({s.admissionNo})</span>
        <span className="ml-2 inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
          Class: {classSection}
        </span>
        <br />
        <span className="text-xs text-muted-foreground">
          Parents: <span className="font-medium text-stone-700">{father}</span> (Father) · <span className="font-medium text-stone-700">{mother}</span> (Mother)
        </span>
        {phones !== "—" && (
          <>
            <br />
            <span className="text-xs text-muted-foreground">Phones: <span className="font-medium text-stone-700">{phones}</span></span>
          </>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <Link href="/students" className={cn(buttonVariants({ variant: "ghost" }))}>
        Back
      </Link>

      {/* SECTION 1: KEEP THIS STUDENT'S PARENT */}
      <Card>
        <CardHeader>
          <CardTitle>1. Keep this student&apos;s parent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Search/filter and select the student whose parent/family record should remain. Other selected students
            will be moved under the same parent.
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2 relative">
              <Input
                type="text"
                placeholder="Search by name, admission no, father/mother, phone..."
                value={search1}
                onChange={(e) => setSearch1(e.target.value)}
                className="pr-10"
              />
              {loading1 && (
                <div className="absolute right-3 top-2.5">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            <div>
              <select
                value={classId1}
                onChange={(e) => setClassId1(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Currently Selected Primary Student Banner */}
          {primaryStudent && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 block mb-1">
                Currently Selected Primary Parent Owner:
              </span>
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={true}
                  readOnly
                  className="mt-1 accent-indigo-600"
                />
                {renderStudentDetails(primaryStudent)}
              </div>
            </div>
          )}

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {!search1.trim() && !classId1 ? (
              <p className="text-center text-xs text-muted-foreground py-6">
                Type above or select a class to search for the primary student...
              </p>
            ) : results1.length === 0 && !loading1 ? (
              <p className="text-center text-xs text-muted-foreground py-6">
                No matching students found.
              </p>
            ) : (
              results1
                // Don't duplicate the currently selected student in the search results list if they are already selected
                .filter((s) => s.id !== primaryStudent?.id)
                .map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md px-2.5 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <input
                      type="radio"
                      name="primary"
                      checked={primaryStudent?.id === s.id}
                      onChange={() => setPrimaryStudent(s)}
                      className="mt-1 accent-indigo-600"
                    />
                    {renderStudentDetails(s)}
                  </label>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 2: LINK THESE SIBLINGS */}
      <Card>
        <CardHeader>
          <CardTitle>2. Link these siblings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Search/filter and select other students who share the same parent.
            {primaryStudent ? (
              <>
                {" "}
                They will join{" "}
                <span className="font-semibold text-indigo-700">{primaryStudent.fullName}</span>&apos;s
                family.
              </>
            ) : null}
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2 relative">
              <Input
                type="text"
                placeholder="Search by name, admission no, father/mother, phone..."
                value={search2}
                onChange={(e) => setSearch2(e.target.value)}
                className="pr-10"
              />
              {loading2 && (
                <div className="absolute right-3 top-2.5">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            <div>
              <select
                value={classId2}
                onChange={(e) => setClassId2(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Currently Selected Siblings */}
          {Object.keys(selectedSiblings).length > 0 && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 block">
                Selected Siblings to Link ({Object.keys(selectedSiblings).length}):
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {Object.values(selectedSiblings).map((s) => (
                  <div key={s.id} className="flex items-start gap-3 border-b border-stone-100 pb-2 last:border-0 last:pb-0">
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => toggleSibling(s)}
                      className="mt-1 accent-emerald-600"
                    />
                    {renderStudentDetails(s)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {!search2.trim() && !classId2 ? (
              <p className="text-center text-xs text-muted-foreground py-6">
                Type above or select a class to search for sibling students...
              </p>
            ) : results2.length === 0 && !loading2 ? (
              <p className="text-center text-xs text-muted-foreground py-6">
                No matching students found.
              </p>
            ) : (
              results2
                // Exclude primary student and already selected siblings from the search list to avoid redundancy
                .filter((s) => s.id !== primaryStudent?.id && !selectedSiblings[s.id])
                .map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md px-2.5 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={!!selectedSiblings[s.id]}
                      onChange={() => toggleSibling(s)}
                      className="mt-1 accent-indigo-600"
                    />
                    {renderStudentDetails(s)}
                  </label>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        type="button"
        disabled={pending || !primaryStudent || Object.keys(selectedSiblings).length === 0}
        onClick={merge}
        className="w-full sm:w-auto shadow-md"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Merging Students...
          </>
        ) : (
          "Merge under same parent"
        )}
      </Button>
    </div>
  );
}

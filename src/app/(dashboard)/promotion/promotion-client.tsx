"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  executeBulkPromotionAction,
  getPromotionPreviewAction,
  undoPromotionAction,
} from "@/server/actions/promotion.actions";
import { toggleSessionLockAction } from "@/server/actions/session.actions";
import { formatDate } from "@/lib/utils";

type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };
type SessionRow = { id: string; name: string; status: string; isCurrent: boolean };
type PromotionBatchRow = {
  id: string;
  createdAt: Date | string;
  status: string;
  fromSession: { id: string; name: string };
  toSession: { id: string; name: string; status: string };
  createdBy?: { name: string } | null;
  _count?: { enrollments: number };
};

type PreviewStudent = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  photoUrl?: string | null;
  currentClassId: string;
  currentClassName: string;
  currentSectionId: string;
  currentSectionName: string;
  currentRollNo?: string | null;
  currentHouse?: string | null;
  targetClassId: string;
  targetSectionId: string;
  targetHouse?: string | null;
  action: "PROMOTE" | "RETAIN" | "TRANSFER" | "WITHDRAW" | "GRADUATE";
};

export function PromotionClient({
  sessions,
  classes,
  promotionBatches,
}: {
  sessions: SessionRow[];
  classes: ClassRow[];
  promotionBatches: PromotionBatchRow[];
}) {
  const [pending, startTransition] = useTransition();

  const [fromSessionId, setFromSessionId] = useState<string>(sessions[0]?.id ?? "");
  const [toSessionId, setToSessionId] = useState<string>(sessions[1]?.id ?? sessions[0]?.id ?? "");

  // Mappings state: list of { fromClassId, fromSectionId, toClassId, toSectionId }
  const [classMappings, setClassMappings] = useState<
    Array<{ fromClassId: string; fromSectionId: string; toClassId: string; toSectionId: string }>
  >([]);

  const [previewData, setPreviewData] = useState<{
    students: PreviewStudent[];
    warnings: string[];
  } | null>(null);

  const [filterClassId, setFilterClassId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [confirmModal, setConfirmModal] = useState(false);

  // Helper: returns true only for genuine Class 10 / X / 10th
  function isClass10Name(name: string): boolean {
    // Match whole-word "10", "X" (roman ten), "10th" — must be standalone, not "1" or "100"
    return /(?:^|\s|-)(?:10|x|10th)(?:\s|-|$)/i.test(name) || /^10$/.test(name.trim());
  }

  // Quick helper to auto-populate class mappings based on class sort / index order
  function handleAutoMap() {
    const mappings: Array<{ fromClassId: string; fromSectionId: string; toClassId: string; toSectionId: string }> = [];
    classes.forEach((cls, idx) => {
      const isTerminal = isClass10Name(cls.name);
      const nextCls = classes[idx + 1];
      cls.sections.forEach((sec) => {
        // Determine target:
        //   - If this is Class 10 → Alumni
        //   - If there is a next class → promote to next class
        //   - Otherwise (last non-10 class, unusual) → map to same class (not Alumni)
        const toClassId = isTerminal ? "ALUMNI" : nextCls?.id ?? cls.id;
        const matchingTargetSec = nextCls?.sections.find((s) => s.name === sec.name) ?? nextCls?.sections[0] ?? sec;
        const toSectionId = isTerminal ? sec.id : (nextCls ? matchingTargetSec.id : sec.id);
        mappings.push({
          fromClassId: cls.id,
          fromSectionId: sec.id,
          toClassId,
          toSectionId,
        });
      });
    });
    setClassMappings(mappings);
    toast.success(`Auto-mapped ${mappings.length} class sections (Class 10 → Alumni, others → next class)`);
  }

  function handleAddMapping() {
    const firstCls = classes[0];
    const firstSec = firstCls?.sections[0];
    if (firstCls && firstSec) {
      setClassMappings((prev) => [
        ...prev,
        {
          fromClassId: firstCls.id,
          fromSectionId: firstSec.id,
          toClassId: classes[1]?.id ?? firstCls.id,
          toSectionId: classes[1]?.sections[0]?.id ?? firstSec.id,
        },
      ]);
    }
  }

  function handleLoadPreview(targetFilterClassId?: string) {
    if (fromSessionId === toSessionId) {
      toast.error("Source and Target Academic Sessions cannot be the same.");
      return;
    }
    if (classMappings.length === 0) {
      toast.error("Please add at least one class mapping or click 'Auto-Map Classes'.");
      return;
    }

    startTransition(async () => {
      const res = await getPromotionPreviewAction({
        fromSessionId,
        toSessionId,
        classMappings,
      });

      if (!res.success || !res.data) {
        toast.error(res.error || "Failed to generate promotion preview");
        return;
      }

      setPreviewData({
        students: res.data.students.map((s) => ({
          ...s,
          targetHouse: s.currentHouse ?? "",
        })),
        warnings: res.data.warnings,
      });

      if (targetFilterClassId) {
        setFilterClassId(targetFilterClassId);
      }

      toast.success(`Loaded ${res.data.students.length} students for promotion preview`);
    });
  }

  function handleStudentActionChange(
    studentId: string,
    action: "PROMOTE" | "RETAIN" | "TRANSFER" | "WITHDRAW" | "GRADUATE"
  ) {
    setPreviewData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        students: prev.students.map((s) => {
          if (s.studentId !== studentId) return s;
          return { ...s, action };
        }),
      };
    });
  }

  function handleBulkClassAction(
    targetClassId: string,
    action: "PROMOTE" | "RETAIN" | "GRADUATE"
  ) {
    setPreviewData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        students: prev.students.map((s) => {
          if (targetClassId !== "ALL" && s.currentClassId !== targetClassId) return s;
          const isTerminal = isClass10Name(s.currentClassName) || s.targetClassId === "ALUMNI";
          let act = action;
          if (isTerminal && act === "PROMOTE") {
            act = "GRADUATE";
          }
          return { ...s, action: act };
        }),
      };
    });
    toast.success(`Updated class students to ${action}`);
  }

  function handleStudentTargetSectionChange(studentId: string, sectionId: string) {
    setPreviewData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        students: prev.students.map((s) => {
          if (s.studentId !== studentId) return s;
          return { ...s, targetSectionId: sectionId };
        }),
      };
    });
  }

  function handleStudentHouseChange(studentId: string, house: string) {
    setPreviewData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        students: prev.students.map((s) => {
          if (s.studentId !== studentId) return s;
          return { ...s, targetHouse: house };
        }),
      };
    });
  }

  function handleExecutePromotion() {
    if (!previewData || previewData.students.length === 0) return;

    startTransition(async () => {
      const payload = {
        fromSessionId,
        toSessionId,
        promotions: previewData.students.map((s) => ({
          studentId: s.studentId,
          fromClassId: s.currentClassId,
          fromSectionId: s.currentSectionId,
          toClassId: s.action === "RETAIN" ? s.currentClassId : s.targetClassId,
          toSectionId: s.action === "RETAIN" ? s.currentSectionId : s.targetSectionId,
          action: s.action,
          targetHouse: s.targetHouse?.trim() || null,
        })),
      };

      const res = await executeBulkPromotionAction(payload);
      if (!res.success) {
        toast.error(res.error || "Failed to execute bulk promotion");
        return;
      }

      toast.success("Bulk promotion executed successfully!");
      setConfirmModal(false);
      setPreviewData(null);
    });
  }

  function handleUndoPromotion(batchId: string) {
    if (
      confirm(
        "Are you sure you want to rollback this promotion batch? New enrollments will be removed and previous statuses restored."
      )
    ) {
      startTransition(async () => {
        const res = await undoPromotionAction({ promotionBatchId: batchId });
        if (!res.success) {
          toast.error(res.error || "Failed to undo promotion");
          return;
        }
        toast.success(`Promotion rolled back successfully for ${res.data?.rolledBackCount} students.`);
      });
    }
  }

  function handleToggleLock(sessionId: string, currentStatus: string) {
    const isLocking = currentStatus !== "LOCKED";
    const msg = isLocking
      ? "Lock this session? Edits to attendance, marks, and promotions will be frozen."
      : "Unlock this academic session?";

    if (confirm(msg)) {
      startTransition(async () => {
        await toggleSessionLockAction(sessionId, isLocking);
        toast.success(isLocking ? "Session locked successfully" : "Session unlocked");
      });
    }
  }

  // Preview Summary Counts
  const promoteCount = previewData?.students.filter((s) => s.action === "PROMOTE").length ?? 0;
  const retainCount = previewData?.students.filter((s) => s.action === "RETAIN").length ?? 0;
  const graduateCount = previewData?.students.filter((s) => s.action === "GRADUATE").length ?? 0;
  const transferCount = previewData?.students.filter((s) => s.action === "TRANSFER").length ?? 0;
  const withdrawCount = previewData?.students.filter((s) => s.action === "WITHDRAW").length ?? 0;

  // Filtered Students in Preview Table
  const filteredStudents = (previewData?.students ?? []).filter((s) => {
    if (filterClassId !== "ALL" && s.currentClassId !== filterClassId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return s.studentName.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Session Lifecycle Lock Bar */}
      <Card className="shadow-sm">
        <CardHeader className="py-3 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Academic Session Status & Lock Controls</CardTitle>
          <span className="text-xs text-muted-foreground">Administrators can freeze past sessions</span>
        </CardHeader>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded border bg-muted/20 px-3 py-1.5 text-xs">
                <span className="font-semibold">{s.name}</span>
                <Badge
                  variant={s.status === "LOCKED" ? "destructive" : s.status === "ACTIVE" ? "success" : "outline"}
                  className="text-[10px] h-4 px-1.5"
                >
                  {s.status}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  disabled={pending}
                  onClick={() => handleToggleLock(s.id, s.status)}
                >
                  {s.status === "LOCKED" ? "Unlock" : "Lock Session"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Session & Class Mapping Setup */}
      <Card className="shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base font-bold">1. Select Sessions & Class-Wise Mappings</CardTitle>
          <p className="text-xs text-muted-foreground">
            Choose source and target academic sessions, then map source classes to target classes for batch promotion.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4 text-xs">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="font-semibold">Source Academic Session (From) *</Label>
              <Select value={fromSessionId} onChange={(e) => setFromSessionId(e.target.value)}>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.status === "LOCKED" ? "(LOCKED)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Target Academic Session (To) *</Label>
              <Select value={toSessionId} onChange={(e) => setToSessionId(e.target.value)}>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.status === "LOCKED" ? "(LOCKED)" : ""}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Class Mappings Table */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                Class & Section Promotion Mappings
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleAutoMap}>
                  Auto-Map Classes
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={handleAddMapping}>
                  + Add Mapping
                </Button>
              </div>
            </div>

            {classMappings.length === 0 ? (
              <div className="rounded border border-dashed p-6 text-center text-muted-foreground">
                No class mappings added yet. Click <strong>Auto-Map Classes</strong> to automatically generate standard promotion mappings.
              </div>
            ) : (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted/40 border-b text-[10px] uppercase font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2.5">Source Class & Section</th>
                      <th className="p-2.5 text-center">To</th>
      <th className="p-2.5">Target Class & Section</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {classMappings.map((m, idx) => {
                      const fromCls = classes.find((c) => c.id === m.fromClassId);
                      const toCls = classes.find((c) => c.id === m.toClassId);
                      const fromSecs = fromCls?.sections ?? [];
                      const toSecs = toCls?.sections ?? [];
                      const isTerminalClass = fromCls?.name ? isClass10Name(fromCls.name) : false;

                      return (
                        <tr key={idx} className="hover:bg-muted/10">
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <Select
                                className="h-8 text-xs font-medium"
                                value={m.fromClassId}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const newCls = classes.find((c) => c.id === val);
                                  const isTerminal = newCls?.name ? isClass10Name(newCls.name) : false;
                                  const clsIndex = classes.findIndex((c) => c.id === val);
                                  const nextC = clsIndex >= 0 ? classes[clsIndex + 1] : undefined;
                                  setClassMappings((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            fromClassId: val,
                                            fromSectionId: newCls?.sections[0]?.id ?? "",
                                            toClassId: isTerminal ? "ALUMNI" : (nextC?.id ?? val),
                                            toSectionId: isTerminal
                                              ? (newCls?.sections[0]?.id ?? "")
                                              : (nextC?.sections[0]?.id ?? newCls?.sections[0]?.id ?? ""),
                                          }
                                        : item
                                    )
                                  );
                                }}
                              >
                                {classes.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                className="h-8 text-xs w-28"
                                value={m.fromSectionId}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setClassMappings((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, fromSectionId: val } : item))
                                  );
                                }}
                              >
                                {fromSecs.map((sec) => (
                                  <option key={sec.id} value={sec.id}>
                                    {sec.name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </td>
                          <td className="p-2 text-center text-muted-foreground font-bold font-mono">➔</td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              {isTerminalClass || m.toClassId === "ALUMNI" ? (
                                <div className="h-8 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2.5 flex items-center">
                                  Alumni (Graduated)
                                </div>
                              ) : (
                                <>
                                  <Select
                                    className="h-8 text-xs font-medium"
                                    value={m.toClassId}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const newCls = classes.find((c) => c.id === val);
                                      setClassMappings((prev) =>
                                        prev.map((item, i) =>
                                          i === idx
                                            ? { ...item, toClassId: val, toSectionId: newCls?.sections[0]?.id ?? item.fromSectionId }
                                            : item
                                        )
                                      );
                                    }}
                                  >
                                    {classes
                                      .filter((c) => c.id !== m.fromClassId)
                                      .map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    <option value="ALUMNI">Alumni (Graduated)</option>
                                  </Select>
                                  {m.toClassId !== "ALUMNI" && (
                                    <Select
                                      className="h-8 text-xs w-28"
                                      value={m.toSectionId}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setClassMappings((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, toSectionId: val } : item))
                                        );
                                      }}
                                    >
                                      {toSecs.map((sec) => (
                                        <option key={sec.id} value={sec.id}>
                                          {sec.name}
                                        </option>
                                      ))}
                                    </Select>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] px-2"
                                title="View and retain specific students in this class"
                                onClick={() => handleLoadPreview(m.fromClassId)}
                              >
                                View Class Students
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-destructive"
                                onClick={() => setClassMappings((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                ✕
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <Button type="button" loading={pending} onClick={() => handleLoadPreview()}>
              Load Promotion Preview
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Promotion Preview & Student Overrides */}
      {previewData && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="border-b py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-primary">
                2. Promotion Preview & Student Overrides
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Review students class-wise. You can retain any student in the same class, promote them, or mark them as Alumni.
              </p>
            </div>
            <Button type="button" onClick={() => setConfirmModal(true)}>
              Execute Promotion ({previewData.students.length} Students)
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs">
            {/* Warnings */}
            {previewData.warnings.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 space-y-1">
                <p className="font-semibold text-xs">Promotion Warnings</p>
                <ul className="list-disc list-inside text-xs">
                  {previewData.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Summary Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              <div className="rounded border bg-muted/20 p-2.5 text-center">
                <span className="block text-[10px] uppercase font-bold text-muted-foreground">Total Students</span>
                <span className="text-base font-bold text-foreground">{previewData.students.length}</span>
              </div>
              <div className="rounded border bg-emerald-500/10 p-2.5 text-center border-emerald-500/30">
                <span className="block text-[10px] uppercase font-bold text-emerald-700">To Promote</span>
                <span className="text-base font-bold text-emerald-700">{promoteCount}</span>
              </div>
              <div className="rounded border bg-amber-500/10 p-2.5 text-center border-amber-500/30">
                <span className="block text-[10px] uppercase font-bold text-amber-700">To Retain (Same)</span>
                <span className="text-base font-bold text-amber-700">{retainCount}</span>
              </div>
              <div className="rounded border bg-indigo-500/10 p-2.5 text-center border-indigo-500/30">
                <span className="block text-[10px] uppercase font-bold text-indigo-700">To Graduate (Alumni)</span>
                <span className="text-base font-bold text-indigo-700">{graduateCount}</span>
              </div>
              <div className="rounded border bg-destructive/10 p-2.5 text-center border-destructive/30">
                <span className="block text-[10px] uppercase font-bold text-destructive">Transferred/Left</span>
                <span className="text-base font-bold text-destructive">{transferCount + withdrawCount}</span>
              </div>
              <div className="rounded border bg-primary/10 p-2.5 text-center border-primary/30">
                <span className="block text-[10px] uppercase font-bold text-primary">New Enrollments</span>
                <span className="text-base font-bold text-primary">{promoteCount + retainCount}</span>
              </div>
            </div>

            {/* Filter Bar & Quick Batch Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-y py-2 bg-muted/20 px-2 rounded">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-xs">Filter by Class:</span>
                <Select
                  value={filterClassId}
                  onChange={(e) => setFilterClassId(e.target.value)}
                  className="h-7 text-xs w-44"
                >
                  <option value="ALL">All Classes ({previewData.students.length})</option>
                  {classes.map((c) => {
                    const cnt = previewData.students.filter((s) => s.currentClassId === c.id).length;
                    if (cnt === 0) return null;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({cnt} students)
                      </option>
                    );
                  })}
                </Select>

                <Input
                  placeholder="Search student or adm no..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 text-xs w-48"
                />
              </div>

              {/* Quick Batch Buttons for Filtered Class */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold mr-1">Class Action:</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => handleBulkClassAction(filterClassId, "PROMOTE")}
                >
                  Set All Promote
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 text-amber-800 border-amber-300 bg-amber-50"
                  onClick={() => handleBulkClassAction(filterClassId, "RETAIN")}
                >
                  Set All Retain (Same Class)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 text-indigo-800 border-indigo-300 bg-indigo-50"
                  onClick={() => handleBulkClassAction(filterClassId, "GRADUATE")}
                >
                  Set All Graduate (Alumni)
                </Button>
              </div>
            </div>

            {/* Interactive Student Table */}
            <div className="max-h-[60vh] overflow-y-auto rounded border">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-muted/40 border-b text-[10px] uppercase font-semibold text-muted-foreground sticky top-0 bg-background z-10">
                  <tr>
                    <th className="p-2.5">Student</th>
                    <th className="p-2.5">Adm No</th>
                    <th className="p-2.5">Current Class</th>
                    <th className="p-2.5">Action Decision</th>
                    <th className="p-2.5">Target Section</th>
                    <th className="p-2.5">Target House</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No students found matching the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => {
                      const targetCls = classes.find(
                        (c) => c.id === (s.action === "RETAIN" ? s.currentClassId : s.targetClassId)
                      );
                      const targetSecs = targetCls?.sections ?? [];
                      const isStudentClass10 =
                        /\b(10|x|10th)\b/i.test(s.currentClassName) ||
                        s.currentClassName.includes("10") ||
                        s.targetClassId === "ALUMNI";

                      return (
                        <tr key={s.studentId} className="hover:bg-muted/10">
                          <td className="p-2 font-medium">{s.studentName}</td>
                          <td className="p-2 font-mono text-[11px]">{s.admissionNo}</td>
                          <td className="p-2 text-muted-foreground font-medium">
                            {s.currentClassName}-{s.currentSectionName}
                          </td>
                          <td className="p-2">
                            <Select
                              className={`h-8 text-xs font-bold ${
                                s.action === "PROMOTE"
                                  ? "text-emerald-700 bg-emerald-50 border-emerald-300"
                                  : s.action === "RETAIN"
                                    ? "text-amber-800 bg-amber-50 border-amber-300"
                                    : s.action === "GRADUATE"
                                      ? "text-indigo-800 bg-indigo-50 border-indigo-300"
                                      : "text-destructive bg-destructive/10"
                              }`}
                              value={s.action}
                              onChange={(e) => handleStudentActionChange(s.studentId, e.target.value as any)}
                            >
                              {!isStudentClass10 && (
                                <option value="PROMOTE">PROMOTE (Pass to next class)</option>
                              )}
                              <option value="GRADUATE">GRADUATE (Move to Alumni)</option>
                              <option value="RETAIN">RETAIN (Keep in same class)</option>
                              <option value="TRANSFER">TRANSFER (Left school)</option>
                              <option value="WITHDRAW">WITHDRAW (Left school)</option>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Select
                              className="h-8 text-xs w-28"
                              disabled={s.action === "TRANSFER" || s.action === "WITHDRAW" || s.action === "GRADUATE"}
                              value={s.action === "RETAIN" ? s.currentSectionId : s.targetSectionId}
                              onChange={(e) => handleStudentTargetSectionChange(s.studentId, e.target.value)}
                            >
                              {targetSecs.map((sec) => (
                                <option key={sec.id} value={sec.id}>
                                  {sec.name}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="p-2">
                            <Input
                              placeholder="House"
                              className="h-8 text-xs w-28"
                              disabled={s.action === "TRANSFER" || s.action === "WITHDRAW" || s.action === "GRADUATE"}
                              value={s.targetHouse ?? ""}
                              onChange={(e) => handleStudentHouseChange(s.studentId, e.target.value)}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Modal */}
      {confirmModal && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="border-b py-3">
              <CardTitle className="text-base font-bold">Confirm Bulk Promotion Execution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              <p>
                You are about to execute bulk promotion for <strong>{previewData.students.length}</strong> students.
              </p>
              <div className="rounded border bg-muted/20 p-3 space-y-1">
                <p>
                  • Promoted: <strong>{promoteCount}</strong> students
                </p>
                <p>
                  • Retained in same class: <strong>{retainCount}</strong> students
                </p>
                <p>
                  • Graduated (Alumni): <strong>{graduateCount}</strong> students
                </p>
                <p>
                  • Transferred/Withdrawn: <strong>{transferCount + withdrawCount}</strong> students
                </p>
                <p>
                  • New Enrollments to create: <strong>{promoteCount + retainCount}</strong>
                </p>
              </div>

              <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-amber-900 text-[11px]">
                Past academic records will be preserved permanently. New enrollments will be created in the target session.
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => setConfirmModal(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="button" loading={pending} onClick={handleExecutePromotion}>
                  Confirm & Execute
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Audit History & Undo Section */}
      <Card className="shadow-sm">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-semibold">Promotion History & Batch Rollback (Undo)</CardTitle>
        </CardHeader>
        <CardContent className="py-3 text-xs">
          {promotionBatches.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center">No promotion batches recorded yet.</p>
          ) : (
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-muted/40 border-b text-[10px] uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Source Session</th>
                    <th className="p-2.5">Target Session</th>
                    <th className="p-2.5">Created By</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {promotionBatches.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/10">
                      <td className="p-2.5 font-medium">{formatDate(b.createdAt)}</td>
                      <td className="p-2.5">{b.fromSession.name}</td>
                      <td className="p-2.5">{b.toSession.name}</td>
                      <td className="p-2.5">{b.createdBy?.name || "—"}</td>
                      <td className="p-2.5">
                        <Badge
                          variant={b.status === "COMPLETED" ? "success" : "secondary"}
                          className="text-[10px] h-4"
                        >
                          {b.status}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-right">
                        {b.status === "COMPLETED" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                            disabled={pending}
                            onClick={() => handleUndoPromotion(b.id)}
                          >
                            Undo Promotion
                          </Button>
                        ) : (
                          <span className="text-muted-foreground font-mono text-[10px]">Rolled Back</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

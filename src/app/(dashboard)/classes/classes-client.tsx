"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { AlertTriangle, Trash2, X } from "lucide-react";
import {
  createClassAction,
  createSectionAction,
  deleteClassAction,
  deleteSectionAction,
} from "@/server/actions/class.actions";

type Section = { id: string; name: string; classId: string };
type ClassRow = {
  id: string;
  name: string;
  sortOrder: number;
  sections: Section[];
};

export function ClassesClient({
  classes,
}: {
  classes: ClassRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [className, setClassName] = useState("");
  const [sectionClassId, setSectionClassId] = useState(classes[0]?.id ?? "");
  const [sectionName, setSectionName] = useState("");
  const [classToDelete, setClassToDelete] = useState<ClassRow | null>(null);

  function run(fn: () => Promise<unknown>, ok: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function confirmDeleteClass() {
    if (!classToDelete) return;
    const target = classToDelete;
    startTransition(async () => {
      try {
        await deleteClassAction(target.id);
        toast.success(`Class ${target.name} deleted`);
        setClassToDelete(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete class");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add class</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class 10" />
            </div>
            <Button
              type="button"
              disabled={pending || !className}
              onClick={() =>
                run(async () => {
                  await createClassAction({ name: className, sortOrder: classes.length });
                  setClassName("");
                }, "Class created")
              }
            >
              Create class
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={sectionClassId} onChange={(e) => setSectionClassId(e.target.value)}>
                <option value="" disabled>
                  Select class
                </option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section</Label>
              <Input value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="A" />
            </div>
            <Button
              type="button"
              disabled={pending || !sectionClassId || !sectionName}
              onClick={() =>
                run(async () => {
                  await createSectionAction({ classId: sectionClassId, name: sectionName });
                  setSectionName("");
                }, "Section created")
              }
            >
              Create section
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Classes & Sections</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[450px] overflow-y-auto divide-y pr-2">
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No classes added yet.</p>
          ) : (
            classes.map((c) => (
              <div key={c.id} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-semibold text-lg text-foreground">
                    {c.name}
                  </h4>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="text-stone-500 font-medium mr-1">Sections:</span>
                    {c.sections.length === 0 ? (
                      <span className="text-muted-foreground italic text-xs">No sections</span>
                    ) : (
                      c.sections.map((s) => (
                        <div
                          key={s.id}
                          className="inline-flex items-center gap-1 bg-stone-100 dark:bg-stone-850 px-2 py-0.5 rounded text-stone-700 dark:text-stone-300 border border-stone-200/60 dark:border-stone-800"
                        >
                          <span>{s.name}</span>
                          <button
                            type="button"
                            className="text-stone-400 hover:text-red-500 font-bold ml-0.5 text-xs transition-colors"
                            disabled={pending}
                            onClick={() => run(() => deleteSectionAction(s.id), "Section deleted")}
                            title={`Remove Section ${s.name}`}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => setClassToDelete(c)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete Class
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Delete Class Confirmation Modal */}
      {classToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Delete Class</h3>
                  <p className="text-xs text-stone-500">{classToDelete.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClassToDelete(null)}
                disabled={pending}
                className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 p-3 text-sm text-rose-800 dark:text-rose-300">
                Are you sure you want to delete <strong>{classToDelete.name}</strong>?
                {classToDelete.sections.length > 0 && (
                  <span className="block mt-1 text-xs text-rose-700 dark:text-rose-400">
                    This will also remove its {classToDelete.sections.length} associated section(s):{" "}
                    {classToDelete.sections.map((s) => s.name).join(", ")}.
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Note: A class cannot be deleted if sections associated with this class have student data.
              </p>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-stone-50 dark:bg-stone-900/50 border-t border-stone-100 dark:border-stone-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setClassToDelete(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDeleteClass}
                disabled={pending}
              >
                {pending ? "Deleting..." : "Yes, Delete Class"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

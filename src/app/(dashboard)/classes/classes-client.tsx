"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
                  onClick={() => run(() => deleteClassAction(c.id), "Class deleted")}
                >
                  Delete Class
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

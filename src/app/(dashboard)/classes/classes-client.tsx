"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  createClassAction,
  createSectionAction,
  createSubjectAction,
  assignClassTeacherAction,
  deleteClassAction,
  deleteSectionAction,
  deleteSubjectAction,
} from "@/server/actions/class.actions";

type Section = { id: string; name: string; classId: string };
type ClassRow = {
  id: string;
  name: string;
  sortOrder: number;
  sections: Section[];
};
type SubjectRow = { id: string; name: string; code: string };
type TeacherRow = { id: string; fullName: string; employeeCode: string };

export function ClassesClient({
  classes,
  subjects,
  teachers,
  currentSessionId,
}: {
  classes: ClassRow[];
  subjects: SubjectRow[];
  teachers: TeacherRow[];
  currentSessionId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [className, setClassName] = useState("");
  const [sectionClassId, setSectionClassId] = useState(classes[0]?.id ?? "");
  const [sectionName, setSectionName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [teacherSectionId, setTeacherSectionId] = useState("");
  const [teacherStaffId, setTeacherStaffId] = useState(teachers[0]?.id ?? "");

  const allSections = useMemo(
    () =>
      classes.flatMap((c) =>
        c.sections.map((s) => ({ ...s, className: c.name })),
      ),
    [classes],
  );

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
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Add class</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class 1" />
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

        <Card>
          <CardHeader>
            <CardTitle>Add subject</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Mathematics" />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} placeholder="MATH" />
            </div>
            <Button
              type="button"
              disabled={pending || !subjectName || !subjectCode}
              onClick={() =>
                run(async () => {
                  await createSubjectAction({ name: subjectName, code: subjectCode });
                  setSubjectName("");
                  setSubjectCode("");
                }, "Subject created")
              }
            >
              Create subject
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assign class teacher</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Section</Label>
            <Select value={teacherSectionId} onChange={(e) => setTeacherSectionId(e.target.value)}>
              <option value="" disabled>
                Select section
              </option>
              {allSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.className} - {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Teacher</Label>
            <Select value={teacherStaffId} onChange={(e) => setTeacherStaffId(e.target.value)}>
              <option value="" disabled>
                Select teacher
              </option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.employeeCode})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={pending || !currentSessionId || !teacherSectionId || !teacherStaffId}
              onClick={() =>
                run(
                  () =>
                    assignClassTeacherAction({
                      sessionId: currentSessionId!,
                      sectionId: teacherSectionId,
                      staffProfileId: teacherStaffId,
                    }),
                  "Class teacher assigned",
                )
              }
            >
              Assign
            </Button>
          </div>
          {!currentSessionId ? (
            <p className="text-sm text-muted-foreground md:col-span-3">
              Set a current academic session before assigning class teachers.
            </p>
          ) : null}
          {teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground md:col-span-3">
              No teachers yet. Create teacher staff from Settings or Excel import.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Classes & sections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {classes.map((c) => (
              <div key={c.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.name}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => deleteClassAction(c.id), "Class deleted")}
                  >
                    Delete
                  </Button>
                </div>
                <div className="mt-2 space-y-1">
                  {c.sections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No sections</p>
                  ) : (
                    c.sections.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-sm">
                        <span>Section {s.name}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => deleteSectionAction(s.id), "Section deleted")}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subjects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {subjects.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  {s.name} <span className="text-muted-foreground">({s.code})</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => deleteSubjectAction(s.id), "Subject deleted")}
                >
                  Remove
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createStudentWithFamilyAction } from "@/server/actions/student.actions";
import { findFamilyByPhoneAction } from "@/server/actions/family.actions";
import { cn } from "@/lib/utils";

type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };
type Session = { id: string; name: string };

type MatchedFamily = {
  id: string;
  fatherName: string | null;
  motherName: string | null;
  primaryPhone: string | null;
  students: Array<{ id: string; fullName: string; admissionNo: string }>;
};

export function NewStudentForm({
  classes,
  sessions,
  currentSessionId,
}: {
  classes: ClassRow[];
  sessions: Session[];
  currentSessionId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [match, setMatch] = useState<MatchedFamily | null>(null);
  const [form, setForm] = useState({
    admissionNo: "",
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    fatherName: "",
    motherName: "",
    guardianName: "",
    phone: "",
    address: "",
    enroll: true,
    sessionId: currentSessionId ?? sessions[0]?.id ?? "",
    classId: classes[0]?.id ?? "",
    sectionId: classes[0]?.sections[0]?.id ?? "",
    rollNo: "",
  });

  const sections = useMemo(
    () => classes.find((c) => c.id === form.classId)?.sections ?? [],
    [classes, form.classId],
  );

  function canSave() {
    return Boolean(
      form.admissionNo.trim() &&
        form.firstName.trim() &&
        form.dateOfBirth &&
        form.phone.trim() &&
        (form.fatherName.trim() || form.motherName.trim() || form.guardianName.trim()),
    );
  }

  async function save(familyId: string | null) {
    await createStudentWithFamilyAction({
      admissionNo: form.admissionNo.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim() || null,
      dateOfBirth: new Date(form.dateOfBirth),
      gender: form.gender ? (form.gender as "MALE" | "FEMALE" | "OTHER") : null,
      fatherName: form.fatherName.trim() || null,
      motherName: form.motherName.trim() || null,
      guardianName: form.guardianName.trim() || null,
      phone: form.phone.trim(),
      address: form.address.trim() || null,
      familyId,
      createLogin: true,
      status: "ACTIVE",
      enroll: form.enroll,
      sessionId: form.enroll ? form.sessionId : null,
      classId: form.enroll ? form.classId : null,
      sectionId: form.enroll ? form.sectionId : null,
      rollNo: form.rollNo.trim() || null,
    });
    toast.success("Student added");
    router.push("/students");
    router.refresh();
  }

  function handleSave() {
    if (!canSave()) {
      toast.error("Fill student name, admission no, DOB, mobile, and at least one parent name");
      return;
    }
    startTransition(async () => {
      try {
        const existing = await findFamilyByPhoneAction(form.phone.trim());
        if (existing && !match) {
          setMatch(existing);
          return;
        }
        await save(match?.id ?? null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/students" className={cn(buttonVariants({ variant: "ghost" }))}>
          Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Student details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Admission no</Label>
            <Input
              value={form.admissionNo}
              onChange={(e) => setForm((f) => ({ ...f, admissionNo: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>First name</Label>
            <Input
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Last name</Label>
            <Input
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Date of birth</Label>
            <Input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={form.gender}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            >
              <option value="">—</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parent details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Father name</Label>
            <Input
              value={form.fatherName}
              onChange={(e) => setForm((f) => ({ ...f, fatherName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Mother name</Label>
            <Input
              value={form.motherName}
              onChange={(e) => setForm((f) => ({ ...f, motherName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Guardian name</Label>
            <Input
              value={form.guardianName}
              onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Mobile number</Label>
            <Input
              value={form.phone}
              onChange={(e) => {
                setMatch(null);
                setForm((f) => ({ ...f, phone: e.target.value }));
              }}
              placeholder="Used to find existing family"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Address</Label>
            <Textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Class (optional)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="flex items-end md:col-span-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enroll}
                onChange={(e) => setForm((f) => ({ ...f, enroll: e.target.checked }))}
              />
              Enroll in class now
            </label>
          </div>
          {form.enroll ? (
            <>
              <div className="space-y-2">
                <Label>Session</Label>
                <Select
                  value={form.sessionId}
                  onChange={(e) => setForm((f) => ({ ...f, sessionId: e.target.value }))}
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Class</Label>
                <Select
                  value={form.classId}
                  onChange={(e) => {
                    const next = classes.find((c) => c.id === e.target.value);
                    setForm((f) => ({
                      ...f,
                      classId: e.target.value,
                      sectionId: next?.sections[0]?.id ?? "",
                    }));
                  }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select
                  value={form.sectionId}
                  onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value }))}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Roll no</Label>
                <Input
                  value={form.rollNo}
                  onChange={(e) => setForm((f) => ({ ...f, rollNo: e.target.value }))}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {match ? (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle>Existing family found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Father: {match.fatherName || "—"} · Mother: {match.motherName || "—"} · Mobile:{" "}
              {match.primaryPhone || form.phone}
            </p>
            {match.students.length > 0 ? (
              <ul className="list-inside list-disc">
                {match.students.map((s) => (
                  <li key={s.id}>
                    {s.fullName} ({s.admissionNo})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No students linked yet.</p>
            )}
            <p>Add this student to the same family?</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await save(match.id);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  })
                }
              >
                Use existing family
              </Button>
              <Button
                type="button"
                variant="outline"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      setMatch(null);
                      await save(null);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  })
                }
              >
                Create new family
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!match ? (
        <Button type="button" loading={pending} disabled={!canSave()} onClick={handleSave}>
          Save student
        </Button>
      ) : null}
    </div>
  );
}

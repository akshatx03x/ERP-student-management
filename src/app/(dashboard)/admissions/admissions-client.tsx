"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdmissionAction,
  approveAdmissionAction,
  rejectAdmissionAction,
} from "@/server/actions/ops.actions";
import { findFamilyByPhoneAction } from "@/server/actions/family.actions";
import { formatDate } from "@/lib/utils";

type Admission = {
  id: string;
  applicantName: string;
  dateOfBirth: Date | string;
  status: string;
  admissionNo: string | null;
  phone: string | null;
  fatherName?: string | null;
  motherName?: string | null;
  appliedClass: { name: string };
  session: { name: string };
};
type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };
type Session = { id: string; name: string };

type MatchedFamily = {
  id: string;
  fatherName: string | null;
  motherName: string | null;
  primaryPhone: string | null;
  students: Array<{ id: string; fullName: string; admissionNo: string }>;
};

type FormState = {
  sessionId: string;
  appliedClassId: string;
  applicantName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  fatherName: string;
  motherName: string;
  guardianName: string;
  address: string;
};

const emptyForm = (
  sessions: Session[],
  classes: ClassRow[],
  currentSessionId: string | null,
): FormState => ({
  sessionId: currentSessionId ?? sessions[0]?.id ?? "",
  appliedClassId: classes[0]?.id ?? "",
  applicantName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  fatherName: "",
  motherName: "",
  guardianName: "",
  address: "",
});

export function AdmissionsClient({
  admissions,
  classes,
  sessions,
  currentSessionId,
}: {
  admissions: Admission[];
  classes: ClassRow[];
  sessions: Session[];
  currentSessionId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState(() => emptyForm(sessions, classes, currentSessionId));
  const [matchDialog, setMatchDialog] = useState<MatchedFamily | null>(null);
  const [approvingApp, setApprovingApp] = useState<Admission | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  const [familySearchPhone, setFamilySearchPhone] = useState("");
  const [foundSearchFamily, setFoundSearchFamily] = useState<MatchedFamily | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  function resetForm() {
    setForm(emptyForm(sessions, classes, currentSessionId));
    setStep(1);
    setMatchDialog(null);
    setFamilySearchPhone("");
    setFoundSearchFamily(null);
    setSearchAttempted(false);
    setSelectedFamilyId(null);
  }

  function studentStepValid() {
    return Boolean(form.sessionId && form.appliedClassId && form.applicantName.trim() && form.dateOfBirth);
  }

  function parentStepValid() {
    return Boolean(form.phone.trim() && (form.fatherName.trim() || form.motherName.trim() || form.guardianName.trim()));
  }

  async function submitAdmission(familyId: string | null) {
    await createAdmissionAction({
      sessionId: form.sessionId,
      appliedClassId: form.appliedClassId,
      applicantName: form.applicantName.trim(),
      dateOfBirth: new Date(form.dateOfBirth),
      gender: form.gender ? (form.gender as "MALE" | "FEMALE" | "OTHER") : null,
      phone: form.phone.trim() || null,
      fatherName: form.fatherName.trim() || null,
      motherName: form.motherName.trim() || null,
      guardianName: form.guardianName.trim() || null,
      address: form.address.trim() || null,
      familyId,
    });
    toast.success("Admission saved");
    resetForm();
  }

  function handleSearchFamily() {
    if (!familySearchPhone.trim()) return;
    startTransition(async () => {
      try {
        const existing = await findFamilyByPhoneAction(familySearchPhone.trim());
        setFoundSearchFamily(existing);
        setSearchAttempted(true);
      } catch (_e) {
        toast.error("Lookup failed");
      }
    });
  }

  function applySearchFamily() {
    if (!foundSearchFamily) return;
    setForm((f) => ({
      ...f,
      fatherName: foundSearchFamily.fatherName ?? "",
      motherName: foundSearchFamily.motherName ?? "",
      phone: foundSearchFamily.primaryPhone ?? f.phone,
    }));
    setSelectedFamilyId(foundSearchFamily.id);
    toast.success("Family linked and fields pre-filled!");
  }

  function handleSave() {
    if (!parentStepValid()) {
      toast.error("Enter mobile number and at least one parent/guardian name");
      return;
    }

    startTransition(async () => {
      try {
        if (selectedFamilyId) {
          await submitAdmission(selectedFamilyId);
          return;
        }
        const existing = await findFamilyByPhoneAction(form.phone.trim());
        if (existing) {
          setMatchDialog(existing);
          return;
        }
        await submitAdmission(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function confirmUseExisting() {
    if (!matchDialog) return;
    const familyId = matchDialog.id;
    startTransition(async () => {
      try {
        await submitAdmission(familyId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function confirmCreateNew() {
    startTransition(async () => {
      try {
        await submitAdmission(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            New admission
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              Step {step} of 2 — {step === 1 ? "Student details" : "Parent details"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Academic session</Label>
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
                  value={form.appliedClassId}
                  onChange={(e) => setForm((f) => ({ ...f, appliedClassId: e.target.value }))}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Student name</Label>
                <Input
                  placeholder="Full name"
                  value={form.applicantName}
                  onChange={(e) => setForm((f) => ({ ...f, applicantName: e.target.value }))}
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
              <div className="flex items-end md:col-span-3">
                <Button
                  type="button"
                  disabled={!studentStepValid()}
                  onClick={() => setStep(2)}
                >
                  Next: Parent details
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-3 rounded-md border border-stone-200 bg-stone-50 p-3 space-y-2">
                <Label className="font-semibold text-xs">Is this student a sibling of an existing student?</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter parent mobile number to look up family..."
                    value={familySearchPhone}
                    onChange={(e) => setFamilySearchPhone(e.target.value)}
                    className="max-w-xs bg-white h-9"
                  />
                  <Button type="button" size="sm" variant="secondary" onClick={handleSearchFamily} disabled={pending}>
                    Search Family
                  </Button>
                </div>
                {foundSearchFamily ? (
                  <div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 flex justify-between items-center mt-1">
                    <span>
                      Found Sibling Family: {foundSearchFamily.fatherName} & {foundSearchFamily.motherName} ({foundSearchFamily.primaryPhone})
                    </span>
                    <Button type="button" size="sm" onClick={applySearchFamily}>
                      Link & Autofill
                    </Button>
                  </div>
                ) : searchAttempted ? (
                  <p className="text-xs text-destructive">No family found with this phone number.</p>
                ) : null}
              </div>

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
                  placeholder="If different from parents"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile number</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Primary contact mobile"
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
              <div className="flex flex-wrap gap-2 md:col-span-3">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={pending || !parentStepValid()}
                  onClick={handleSave}
                >
                  Save admission
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {matchDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader>
              <CardTitle>Existing family found</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-1">
                <p>
                  <span className="text-muted-foreground">Father:</span>{" "}
                  {matchDialog.fatherName || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Mother:</span>{" "}
                  {matchDialog.motherName || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Mobile:</span>{" "}
                  {matchDialog.primaryPhone || form.phone}
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium">This family already has the following students:</p>
                {matchDialog.students.length === 0 ? (
                  <p className="text-muted-foreground">No students linked yet.</p>
                ) : (
                  <ul className="list-inside list-disc space-y-1">
                    {matchDialog.students.map((s) => (
                      <li key={s.id}>
                        {s.fullName}
                        {s.admissionNo ? (
                          <span className="text-muted-foreground"> ({s.admissionNo})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p>Do you want to add this student to the same family?</p>

              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={pending} onClick={confirmUseExisting}>
                  Use existing family
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={confirmCreateNew}
                >
                  Create new family
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setMatchDialog(null)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {approvingApp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader>
              <CardTitle>Approve Admission — {approvingApp.applicantName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Section</Label>
                <Select
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                >
                  {(classes.find((c) => c.name === approvingApp.appliedClass.name)?.sections ?? []).map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApprovingApp(null)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pending || !selectedSectionId}
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        await approveAdmissionAction({ id: approvingApp.id, sectionId: selectedSectionId });
                        toast.success("Approved — admission number assigned");
                        setApprovingApp(null);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed");
                      }
                    });
                  }}
                >
                  {pending ? "Approving..." : "Confirm Approval"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="space-y-2">
        {admissions.map((a) => {
          return (
            <div
              key={a.id}
              className="flex flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{a.applicantName}</p>
                <p className="text-sm text-muted-foreground">
                  {a.session.name} · {a.appliedClass.name} · DOB {formatDate(a.dateOfBirth)}
                  {a.admissionNo ? ` · ${a.admissionNo}` : ""}
                  {a.phone ? ` · ${a.phone}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                     a.status === "APPROVED"
                       ? "success"
                       : a.status === "REJECTED"
                         ? "destructive"
                         : "warning"
                  }
                >
                  {a.status}
                </Badge>
                {a.status === "PENDING" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        const clsInfo = classes.find((c) => c.name === a.appliedClass.name);
                        const secs = clsInfo?.sections ?? [];
                        setApprovingApp(a);
                        setSelectedSectionId(secs[0]?.id ?? "");
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await rejectAdmissionAction({ id: a.id, remarks: "Rejected" });
                            toast.success("Rejected");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          }
                        })
                      }
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

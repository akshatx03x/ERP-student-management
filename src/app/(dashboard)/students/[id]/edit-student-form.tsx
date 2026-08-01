"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateStudentAction, unlinkStudentFamilyAction } from "@/server/actions/student.actions";
import { findFamilyByPhoneAction } from "@/server/actions/family.actions";
import type { UpdateStudentInput } from "@/server/validators/student.validator";

type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };

export function EditStudentForm({
  student,
  classes,
  onCancel,
  onSaved,
}: {
  student: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
    dateOfBirth: string | Date;
    admissionDate?: string | Date | null;
    gender: string | null;
    bloodGroup: string | null;
    aadhaar: string | null;
    apaarId?: string | null;
    penId?: string | null;
    previousSchoolName?: string | null;
    religion?: string | null;
    status: string;
    photoUrl?: string | null;
    srNo?: string | null;
    primaryPhone?: string | null;
    familyId?: string | null;
    classId?: string | null;
    sectionId?: string | null;
    siblings?: Array<{ id: string; fullName: string; admissionNo: string | null }>;
    tcNumber?: string | null;
    exitReason?: string | null;
  };
  classes: ClassRow[];
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [siblings, setSiblings] = useState<any[]>(student.siblings ?? []);
  const [unlinkFamily, setUnlinkFamily] = useState(false);
  const [lookupPhone, setLookupPhone] = useState("");
  const [matchingFamily, setMatchingFamily] = useState<any>(null);

  // Helper to format date for input field
  const formatDateString = (d: string | Date) => {
    if (!d) return "";
    const date = new Date(d);
    return date.toISOString().split("T")[0];
  };

  const [form, setForm] = useState({
    firstName: student.firstName,
    middleName: student.middleName ?? "",
    lastName: student.lastName ?? "",
    dateOfBirth: formatDateString(student.dateOfBirth),
    admissionDate: formatDateString(student.admissionDate ?? new Date()),
    gender: student.gender ?? "",
    bloodGroup: student.bloodGroup ?? "",
    aadhaar: student.aadhaar ?? "",
    apaarId: student.apaarId ?? "",
    penId: student.penId ?? "",
    previousSchoolName: student.previousSchoolName ?? "",
    religion: student.religion ?? "",
    status: student.status,
    photoUrl: student.photoUrl ?? "",
    srNo: student.srNo ?? "",
    primaryPhone: student.primaryPhone ?? "",
    familyId: student.familyId ?? "",
    classId: student.classId ?? "",
    sectionId: student.sectionId ?? "",
    tcNumber: student.tcNumber ?? "",
    exitReason: student.exitReason ?? "TRANSFERRED",
  });

  const sections = useMemo(
    () => classes.find((c) => c.id === form.classId)?.sections ?? [],
    [classes, form.classId]
  );

  const handleLookupFamily = async () => {
    if (!lookupPhone.trim()) return;
    try {
      const family = await findFamilyByPhoneAction(lookupPhone.trim());
      if (family) {
        setMatchingFamily(family);
        toast.success(`Family Matched! Father: ${family.fatherName ?? '—'}, Mother: ${family.motherName ?? '—'}`);
      } else {
        toast.error("No family found with this phone number");
      }
    } catch (e) {
      toast.error("Lookup failed");
    }
  };

  const handleLinkFamily = () => {
    if (!matchingFamily) return;
    setForm((prev) => ({
      ...prev,
      familyId: matchingFamily.id,
      primaryPhone: matchingFamily.primaryPhone ?? prev.primaryPhone,
    }));
    setSiblings(matchingFamily.students ?? []);
    setUnlinkFamily(false);
    toast.success("Family linked! Save changes to persist.");
    setMatchingFamily(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim()) {
      toast.error("First Name is required");
      return;
    }

    startTransition(async () => {
      try {
        const input: UpdateStudentInput = {
          id: student.id,
          firstName: form.firstName.trim(),
          middleName: form.middleName.trim() || null,
          lastName: form.lastName.trim() || null,
          dateOfBirth: new Date(form.dateOfBirth),
          admissionDate: form.admissionDate ? new Date(form.admissionDate) : null,
          gender: (form.gender as "MALE" | "FEMALE" | "OTHER") || null,
          bloodGroup: form.bloodGroup.trim() || null,
          aadhaar: form.aadhaar.trim() || null,
          apaarId: form.apaarId.trim() || null,
          penId: form.penId.trim() || null,
          previousSchoolName: form.previousSchoolName.trim() || null,
          religion: form.religion.trim() || null,
          status: (form.status === "ALUMNI" || form.status === "TRANSFERRED" || form.status === "INACTIVE" ? "LEFT" : form.status) as "ACTIVE" | "LEFT" | "ARCHIVED",
          exitReason: form.status !== "ACTIVE" ? (form.exitReason as any) : null,
          photoUrl: form.photoUrl || null,
          srNo: form.srNo.trim() || null,
          tcNumber: form.status !== "ACTIVE" ? form.tcNumber.trim() || null : null,
          primaryPhone: form.primaryPhone.trim() || null,
          classId: form.classId || null,
          sectionId: form.sectionId || null,
          familyId: form.familyId || null,
          unlinkFamily: unlinkFamily,
        };

        await updateStudentAction(input);
        toast.success("Student profile updated successfully");
        router.push(`/students/${student.id}`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update profile");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Profile Photo Uploader */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-stone-50/50 p-4 rounded-lg border border-dashed mb-4">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-stone-205 bg-background shadow-xs">
          {form.photoUrl ? (
            <img src={form.photoUrl} alt="Student Profile" className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground text-xs font-medium">
              <span className="text-xl">📷</span>
              <span>Photo</span>
            </div>
          )}
        </div>
        <div className="space-y-1 text-center sm:text-left">
          <Label className="text-sm font-semibold">Student Profile Picture</Label>
          <p className="text-xs text-muted-foreground">Upload passport size photo (JPG, PNG or WEBP, max 3MB).</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 3 * 1024 * 1024) {
                    alert("Please select an image smaller than 3MB.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setForm(prev => ({ ...prev, photoUrl: reader.result as string }));
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="w-auto h-8 text-xs cursor-pointer"
            />
            {form.photoUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => setForm(prev => ({ ...prev, photoUrl: "" }))}
              >
                Clear Photo
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="srNo">SR Number</Label>
          <Input
            id="srNo"
            placeholder="e.g. SR-12345"
            value={form.srNo}
            onChange={(e) => setForm(f => ({ ...f, srNo: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="primaryPhone">Primary Contact Mobile</Label>
          <Input
            id="primaryPhone"
            placeholder="Mobile number for family"
            value={form.primaryPhone}
            onChange={(e) => setForm(f => ({ ...f, primaryPhone: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="classId">Class</Label>
          <Select
            value={form.classId}
            onChange={(e) => setForm(f => ({ ...f, classId: e.target.value, sectionId: "" }))}
          >
            <option value="" disabled>Select Class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sectionId">Section</Label>
          <Select
            value={form.sectionId}
            onChange={(e) => setForm(f => ({ ...f, sectionId: e.target.value }))}
            disabled={!form.classId}
          >
            <option value="">Select Section</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="middleName">Middle name</Label>
          <Input
            id="middleName"
            value={form.middleName}
            onChange={(e) => setForm((f) => ({ ...f, middleName: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input
            id="dateOfBirth"
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admissionDate">Admission Date</Label>
          <Input
            id="admissionDate"
            type="date"
            value={form.admissionDate}
            onChange={(e) => setForm((f) => ({ ...f, admissionDate: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <Select
            id="gender"
            value={form.gender}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
          >
            <option value="">Select gender</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bloodGroup">Blood group</Label>
          <Input
            id="bloodGroup"
            placeholder="e.g. A+"
            value={form.bloodGroup}
            onChange={(e) => setForm((f) => ({ ...f, bloodGroup: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="aadhaar">Aadhaar No.</Label>
          <Input
            id="aadhaar"
            placeholder="12-digit Aadhaar number"
            value={form.aadhaar}
            onChange={(e) => setForm((f) => ({ ...f, aadhaar: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            id="status"
            value={form.status}
            onChange={(e) => {
              const val = e.target.value;
              let defaultReason = "TRANSFERRED";
              if (val === "ALUMNI") defaultReason = "GRADUATED";
              else if (val === "INACTIVE") defaultReason = "WITHDRAWN";
              setForm((f) => ({ ...f, status: val, exitReason: defaultReason }));
            }}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="TRANSFERRED">Transferred</option>
            <option value="ALUMNI">Alumni</option>
          </Select>
        </div>
      </div>

      {form.status !== "ACTIVE" && (
        <div className="grid gap-4 sm:grid-cols-2 bg-stone-50/50 p-4 rounded-xl border border-stone-200 border-dashed">
          <div className="space-y-2">
            <Label htmlFor="tcNumber">TC / Reference Number</Label>
            <Input
              id="tcNumber"
              placeholder="e.g. TC-2026-009"
              value={form.tcNumber}
              onChange={(e) => setForm(f => ({ ...f, tcNumber: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exitReason">TC / Exit Reason</Label>
            <Select
              id="exitReason"
              value={form.exitReason}
              onChange={(e) => setForm(f => ({ ...f, exitReason: e.target.value }))}
            >
              <option value="TRANSFERRED">Transferred</option>
              <option value="WITHDRAWN">Withdrawn</option>
              <option value="GRADUATED">Graduated (Alumni)</option>
              <option value="EXPELLED">Expelled</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 border-t pt-3">
        <div className="space-y-2">
          <Label htmlFor="apaarId">APAAR ID</Label>
          <Input
            id="apaarId"
            placeholder="APAAR ID"
            value={(form as any).apaarId || ""}
            onChange={(e) => setForm((f) => ({ ...f, apaarId: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="penId">PEN ID</Label>
          <Input
            id="penId"
            placeholder="PEN ID"
            value={(form as any).penId || ""}
            onChange={(e) => setForm((f) => ({ ...f, penId: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="previousSchoolName">Previous School Name</Label>
          <Input
            id="previousSchoolName"
            placeholder="Previous School"
            value={(form as any).previousSchoolName || ""}
            onChange={(e) => setForm((f) => ({ ...f, previousSchoolName: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="religion">Religion</Label>
          <Input
            id="religion"
            placeholder="e.g. Hindu / Christian"
            value={(form as any).religion || ""}
            onChange={(e) => setForm((f) => ({ ...f, religion: e.target.value }))}
          />
        </div>
      </div>

      <Card className="border-stone-200">
        <CardHeader className="bg-stone-50/50 py-3">
          <CardTitle className="text-sm font-semibold text-stone-700">Linked Siblings & Family Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {siblings.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No linked siblings.</p>
          ) : (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-stone-500">Linked Siblings:</span>
              <ul className="space-y-2">
                {siblings.map((sib) => (
                  <li key={sib.id} className="flex items-center justify-between gap-4 p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-sm text-stone-700">
                    <div>
                      <span className="font-semibold text-stone-900">{sib.fullName}</span>
                      {sib.admissionNo ? <span className="text-xs text-muted-foreground ml-1">({sib.admissionNo})</span> : null}
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 text-[10px] px-2.5"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to unlink ${sib.fullName} from this family? This will separate them into their own family record immediately.`)) {
                          startTransition(async () => {
                            try {
                              await unlinkStudentFamilyAction(sib.id);
                              setSiblings((prev) => prev.filter((s) => s.id !== sib.id));
                              toast.success(`${sib.fullName} unlinked successfully!`);
                            } catch (e) {
                              toast.error("Failed to unlink sibling");
                            }
                          });
                        }
                      }}
                    >
                      Unlink Sibling
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs font-semibold text-stone-600">Link to a different family (to link siblings)</Label>
            <div className="flex gap-2 max-w-md">
              <Input
                placeholder="Enter sibling's family mobile number"
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
                className="h-9 text-xs"
              />
              <Button type="button" size="sm" onClick={handleLookupFamily} variant="secondary">
                Search
              </Button>
            </div>
            {matchingFamily && (
              <div className="mt-2 p-3 bg-stone-50 rounded border border-stone-200 flex items-center justify-between gap-4">
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-stone-800">Matched Family Details:</p>
                  <p>Father: {matchingFamily.fatherName || "—"}</p>
                  <p>Mother: {matchingFamily.motherName || "—"}</p>
                </div>
                <Button type="button" size="sm" onClick={handleLinkFamily}>
                  Link Family
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onCancel ? onCancel() : router.push(`/students/${student.id}`)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type GuardianItem = {
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
  occupation: string;
  isEmergencyContact: boolean;
};

export type PreviousSchoolItem = {
  id: string;
  schoolName: string;
  class: string;
  tcNumber: string;
  tcDate: string;
};

export type TransportStopItem = {
  id: string;
  stop: string;
};

export type UnifiedFormState = {
  // 1. Academic & Personal
  admissionNo: string;
  admissionDate: string;
  sessionId: string;
  appliedClassId: string;
  sectionId: string;
  rollNo: string;
  firstName: string;
  middleName: string;
  lastName: string;
  applicantName: string;
  dateOfBirth: string;
  gender: string;
  religion: string;
  category: string;
  aadhaar: string;
  apaarId: string;
  penId: string;
  srNo: string;
  photoUrl: string;
  bloodGroup: string;

  // 2. Father
  fatherName: string;
  fatherQualification: string;
  fatherOccupation: string;
  fatherDesignation: string;
  fatherAnnualIncome: string;
  fatherOfficeAddress: string;
  fatherPhone: string;
  fatherAadhaar: string;
  fatherEmail: string;
  fatherWhatsApp: string;
  fatherPhotoUrl: string;

  // 3. Mother
  motherName: string;
  motherQualification: string;
  motherIsWorking: boolean;
  motherOccupation: string;
  motherDesignation: string;
  motherAnnualIncome: string;
  motherOfficeAddress: string;
  motherPhone: string;
  motherAadhaar: string;
  motherEmail: string;
  motherWhatsApp: string;
  motherPhotoUrl: string;

  // 4. Guardians & Contact
  guardianName: string;
  phone: string;
  secondaryPhone: string;
  address: string;
  guardians: GuardianItem[];
  primaryPhoneBelongsTo: string;
  secondaryPhoneBelongsTo: string;

  // 5. Addresses
  resAddressLine1: string;
  resAddressLine2: string;
  resCity: string;
  resState: string;
  resPincode: string;
  sameAsResidential: boolean;
  permAddressLine1: string;
  permAddressLine2: string;
  permCity: string;
  permState: string;
  permPincode: string;

  // 6. Previous School & Declaration
  previousSchoolName: string;
  previousClass: string;
  previousBoard: string;
  previousReason: string;
  tcNumber: string;
  tcDate: string;
  additionalSchools: PreviousSchoolItem[];
  transportRequired: boolean;
  transportPickupPoint: string;
  transportRoute: string;
  transportVehicle: string;
  transportDriver: string;
  transportDriverContact: string;
  additionalTransportStops: TransportStopItem[];
  declarationAccepted: boolean;
  declarationDate: string;
  declarationParentName: string;

  // 7. Medical
  allergies: string;
  conditions: string;
  disability: string;
  emergencyRemarks: string;
};

type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };
type Session = { id: string; name: string };

export function UnifiedStudentForm({
  classes,
  sessions,
  currentSessionId,
  mode = "admission",
  onSubmit,
  onSearchFamily,
}: {
  classes: ClassRow[];
  sessions: Session[];
  currentSessionId: string | null;
  mode?: "admission" | "direct";
  onSubmit: (formState: UnifiedFormState) => Promise<void>;
  onSearchFamily?: (phone: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState<UnifiedFormState>(() => ({
    applicantName: "",
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    religion: "",
    category: "",
    aadhaar: "",
    apaarId: "",
    penId: "",
    srNo: "",
    photoUrl: "",
    bloodGroup: "",

    sessionId: currentSessionId ?? sessions[0]?.id ?? "",
    appliedClassId: classes[0]?.id ?? "",
    sectionId: classes[0]?.sections[0]?.id ?? "",
    rollNo: "",
    admissionNo: "",
    admissionDate: new Date().toISOString().split("T")[0],

    fatherName: "",
    fatherQualification: "",
    fatherOccupation: "",
    fatherDesignation: "",
    fatherAnnualIncome: "",
    fatherOfficeAddress: "",
    fatherPhone: "",
    fatherAadhaar: "",
    fatherEmail: "",
    fatherWhatsApp: "",
    fatherPhotoUrl: "",

    motherName: "",
    motherQualification: "",
    motherIsWorking: false,
    motherOccupation: "",
    motherDesignation: "",
    motherAnnualIncome: "",
    motherOfficeAddress: "",
    motherPhone: "",
    motherAadhaar: "",
    motherEmail: "",
    motherWhatsApp: "",
    motherPhotoUrl: "",

    guardianName: "",
    phone: "",
    secondaryPhone: "",
    address: "",
    guardians: [],
    primaryPhoneBelongsTo: "FATHER",
    secondaryPhoneBelongsTo: "MOTHER",

    resAddressLine1: "",
    resAddressLine2: "",
    resCity: "",
    resState: "",
    resPincode: "",
    sameAsResidential: true,
    permAddressLine1: "",
    permAddressLine2: "",
    permCity: "",
    permState: "",
    permPincode: "",

    previousSchoolName: "",
    previousClass: "",
    previousBoard: "",
    previousReason: "",
    tcNumber: "",
    tcDate: "",
    additionalSchools: [],
    transportRequired: false,
    transportPickupPoint: "",
    transportRoute: "",
    transportVehicle: "",
    transportDriver: "",
    transportDriverContact: "",
    additionalTransportStops: [],

    declarationAccepted: true,
    declarationDate: new Date().toISOString().split("T")[0],
    declarationParentName: "",

    allergies: "",
    conditions: "",
    disability: "",
    emergencyRemarks: "",
  }));

  const sections = useMemo(
    () => classes.find((c) => c.id === form.appliedClassId)?.sections ?? [],
    [classes, form.appliedClassId]
  );

  function handleChange<K extends keyof UnifiedFormState>(key: K, value: UnifiedFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await onSubmit(form);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 1. Academic & Personal Details */}
      <Card>
        <CardHeader>
          <CardTitle>1. Academic & Student Personal Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {/* Profile Photo Uploader */}
          <div className="md:col-span-3 flex flex-col sm:flex-row items-center gap-4 bg-muted/20 p-4 rounded-lg border border-dashed mb-2">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-muted bg-background shadow-xs">
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
                        handleChange("photoUrl", reader.result as string);
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
                    onClick={() => handleChange("photoUrl", "")}
                  >
                    Clear Photo
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Admission No {mode === "direct" ? "*" : "(Optional)"}</Label>
            <Input
              required={mode === "direct"}
              placeholder="e.g. ADM-2026-0001"
              value={form.admissionNo}
              onChange={(e) => handleChange("admissionNo", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>SR Number</Label>
            <Input
              placeholder="e.g. SR-12345"
              value={form.srNo}
              onChange={(e) => handleChange("srNo", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Admission Date *</Label>
            <Input
              required
              type="date"
              value={form.admissionDate}
              onChange={(e) => handleChange("admissionDate", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Academic Session *</Label>
            <Select
              value={form.sessionId}
              onChange={(e) => handleChange("sessionId", e.target.value)}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Class *</Label>
            <Select
              value={form.appliedClassId}
              onChange={(e) => handleChange("appliedClassId", e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          {mode === "direct" && (
            <div className="space-y-2">
              <Label>Section *</Label>
              <Select
                value={form.sectionId}
                onChange={(e) => handleChange("sectionId", e.target.value)}
              >
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Student Full Name *</Label>
            <Input
              required
              placeholder="Full Name"
              value={form.applicantName}
              onChange={(e) => {
                const val = e.target.value;
                handleChange("applicantName", val);
                const parts = val.trim().split(/\s+/);
                handleChange("firstName", parts[0] || "");
                handleChange("lastName", parts.length > 1 ? parts.slice(1).join(" ") : "");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Date of Birth *</Label>
            <Input
              required
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => handleChange("dateOfBirth", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={form.gender}
              onChange={(e) => handleChange("gender", e.target.value)}
            >
              <option value="">Select Gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Blood Group</Label>
            <Input
              placeholder="e.g. A+, B-, O+"
              value={form.bloodGroup}
              onChange={(e) => handleChange("bloodGroup", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={form.category}
              onChange={(e) => handleChange("category", e.target.value)}
            >
              <option value="">Select Category</option>
              <option value="GENERAL">General</option>
              <option value="OBC">OBC</option>
              <option value="SC">SC</option>
              <option value="ST">ST</option>
              <option value="EWS">EWS</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Religion</Label>
            <Input
              placeholder="e.g. Hinduism, Islam, Christianity"
              value={form.religion}
              onChange={(e) => handleChange("religion", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Aadhaar Number</Label>
            <Input
              placeholder="12-digit Aadhaar No"
              maxLength={12}
              value={form.aadhaar}
              onChange={(e) => handleChange("aadhaar", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>APAAR ID</Label>
            <Input
              placeholder="Automated Permanent Academic Account Registry"
              value={form.apaarId}
              onChange={(e) => handleChange("apaarId", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>PEN ID</Label>
            <Input
              placeholder="Permanent Education Number (UDISE+)"
              value={form.penId}
              onChange={(e) => handleChange("penId", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 2. Father Details */}
      <Card>
        <CardHeader>
          <CardTitle>2. Father Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Father Name</Label>
            <Input
              placeholder="Father's Full Name"
              value={form.fatherName}
              onChange={(e) => handleChange("fatherName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Qualification</Label>
            <Input
              placeholder="e.g. Graduate, B.Tech, M.Com"
              value={form.fatherQualification}
              onChange={(e) => handleChange("fatherQualification", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Profession / Designation</Label>
            <Input
              placeholder="e.g. Engineer, Business, Manager"
              value={form.fatherOccupation}
              onChange={(e) => handleChange("fatherOccupation", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Father Phone</Label>
            <Input
              placeholder="Mobile Number"
              value={form.fatherPhone}
              onChange={(e) => handleChange("fatherPhone", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Father WhatsApp</Label>
            <Input
              placeholder="WhatsApp Number"
              value={form.fatherWhatsApp}
              onChange={(e) => handleChange("fatherWhatsApp", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Father Email</Label>
            <Input
              type="email"
              placeholder="father@example.com"
              value={form.fatherEmail}
              onChange={(e) => handleChange("fatherEmail", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Annual Income (₹)</Label>
            <Input
              type="number"
              placeholder="e.g. 500000"
              value={form.fatherAnnualIncome}
              onChange={(e) => handleChange("fatherAnnualIncome", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Father Aadhaar</Label>
            <Input
              placeholder="12-digit Aadhaar No"
              maxLength={12}
              value={form.fatherAadhaar}
              onChange={(e) => handleChange("fatherAadhaar", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Office Address</Label>
            <Input
              placeholder="Work / Office Address"
              value={form.fatherOfficeAddress}
              onChange={(e) => handleChange("fatherOfficeAddress", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Mother Details */}
      <Card>
        <CardHeader>
          <CardTitle>3. Mother Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Mother Name</Label>
            <Input
              placeholder="Mother's Full Name"
              value={form.motherName}
              onChange={(e) => handleChange("motherName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Qualification</Label>
            <Input
              placeholder="e.g. Postgraduate, B.A"
              value={form.motherQualification}
              onChange={(e) => handleChange("motherQualification", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Working Status</Label>
            <Select
              value={form.motherIsWorking ? "yes" : "no"}
              onChange={(e) => handleChange("motherIsWorking", e.target.value === "yes")}
            >
              <option value="no">Homemaker / Non-working</option>
              <option value="yes">Working Professional</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Profession / Designation</Label>
            <Input
              placeholder="e.g. Teacher, Doctor, Homemaker"
              value={form.motherOccupation}
              onChange={(e) => handleChange("motherOccupation", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Mother Phone</Label>
            <Input
              placeholder="Mobile Number"
              value={form.motherPhone}
              onChange={(e) => handleChange("motherPhone", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Mother WhatsApp</Label>
            <Input
              placeholder="WhatsApp Number"
              value={form.motherWhatsApp}
              onChange={(e) => handleChange("motherWhatsApp", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Mother Email</Label>
            <Input
              type="email"
              placeholder="mother@example.com"
              value={form.motherEmail}
              onChange={(e) => handleChange("motherEmail", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Mother Aadhaar</Label>
            <Input
              placeholder="12-digit Aadhaar No"
              maxLength={12}
              value={form.motherAadhaar}
              onChange={(e) => handleChange("motherAadhaar", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Office Address</Label>
            <Input
              placeholder="Work / Office Address"
              value={form.motherOfficeAddress}
              onChange={(e) => handleChange("motherOfficeAddress", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Guardian Details & Residential / Permanent Address */}
      <Card>
        <CardHeader>
          <CardTitle>4. Primary Mobile & Address Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Primary Contact Mobile *</Label>
            <div className="flex gap-2">
              <Input
                required
                placeholder="Primary mobile for SMS & family linking"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
              />
              {onSearchFamily && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onSearchFamily(form.phone)}
                >
                  Lookup
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Primary Contact Belongs To</Label>
            <Select
              value={form.primaryPhoneBelongsTo}
              onChange={(e) => handleChange("primaryPhoneBelongsTo", e.target.value)}
            >
              <option value="FATHER">Father</option>
              <option value="MOTHER">Mother</option>
              <option value="GUARDIAN_1">Guardian 1</option>
              <option value="GUARDIAN_2">Guardian 2</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Secondary Phone / Landline</Label>
            <Input
              placeholder="Landline or Alternate Mobile"
              value={form.secondaryPhone}
              onChange={(e) => handleChange("secondaryPhone", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Secondary Contact Belongs To</Label>
            <Select
              value={form.secondaryPhoneBelongsTo}
              onChange={(e) => handleChange("secondaryPhoneBelongsTo", e.target.value)}
            >
              <option value="FATHER">Father</option>
              <option value="MOTHER">Mother</option>
              <option value="GUARDIAN_1">Guardian 1</option>
              <option value="GUARDIAN_2">Guardian 2</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Guardian Name (if other than Parents)</Label>
            <Input
              placeholder="Primary Guardian Name"
              value={form.guardianName}
              onChange={(e) => handleChange("guardianName", e.target.value)}
            />
          </div>

          {/* Multiple Guardians Section */}
          <div className="md:col-span-3 border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm">Additional Guardians & Emergency Contacts</h4>
                <p className="text-xs text-muted-foreground">Add legal guardians, local guardians, or additional emergency contacts.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setForm((prev) => {
                    const nextG: GuardianItem[] = [
                      ...prev.guardians,
                      {
                        id: Math.random().toString(36).substring(2, 9),
                        fullName: "",
                        relationship: "LEGAL_GUARDIAN",
                        phone: "",
                        occupation: "",
                        isEmergencyContact: false,
                      },
                    ];
                    const summary = nextG
                      .map((item) => (item.fullName ? `${item.fullName} (${item.relationship})` : ""))
                      .filter(Boolean)
                      .join(", ");
                    return {
                      ...prev,
                      guardians: nextG,
                      guardianName: summary || prev.guardianName,
                    };
                  });
                }}
              >
                + Add Guardian
              </Button>
            </div>

            {form.guardians.length === 0 ? (
              <p className="text-xs text-muted-foreground italic bg-muted/40 p-3 rounded text-center">
                No extra guardians added yet. Click "+ Add Guardian" to add local or legal guardians.
              </p>
            ) : (
              <div className="space-y-3">
                {form.guardians.map((g, idx) => (
                  <div key={g.id || idx} className="grid gap-3 rounded-md border p-3 bg-muted/20 md:grid-cols-4 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Guardian Full Name</Label>
                      <Input
                        placeholder="Full Name"
                        value={g.fullName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm((prev) => {
                            const nextG = [...prev.guardians];
                            nextG[idx] = { ...nextG[idx], fullName: val };
                            const summary = nextG
                              .map((item) => (item.fullName ? `${item.fullName} (${item.relationship})` : ""))
                              .filter(Boolean)
                              .join(", ");
                            return { ...prev, guardians: nextG, guardianName: summary };
                          });
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Relationship</Label>
                      <Select
                        value={g.relationship}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm((prev) => {
                            const nextG = [...prev.guardians];
                            nextG[idx] = { ...nextG[idx], relationship: val };
                            const summary = nextG
                              .map((item) => (item.fullName ? `${item.fullName} (${item.relationship})` : ""))
                              .filter(Boolean)
                              .join(", ");
                            return { ...prev, guardians: nextG, guardianName: summary };
                          });
                        }}
                        className="h-8 text-xs"
                      >
                        <option value="LEGAL_GUARDIAN">Legal Guardian</option>
                        <option value="LOCAL_GUARDIAN">Local Guardian</option>
                        <option value="GRANDPARENT">Grandparent</option>
                        <option value="UNCLE">Uncle</option>
                        <option value="AUNT">Aunt</option>
                        <option value="OTHER">Other Relative</option>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Contact Phone</Label>
                      <Input
                        placeholder="Mobile Number"
                        value={g.phone}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm((prev) => {
                            const nextG = [...prev.guardians];
                            nextG[idx] = { ...nextG[idx], phone: val };
                            return { ...prev, guardians: nextG };
                          });
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={g.isEmergencyContact}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setForm((prev) => {
                              const nextG = [...prev.guardians];
                              nextG[idx] = { ...nextG[idx], isEmergencyContact: val };
                              return { ...prev, guardians: nextG };
                            });
                          }}
                          className="rounded border-muted-foreground/40"
                        />
                        Emergency
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setForm((prev) => {
                            const nextG = prev.guardians.filter((_, i) => i !== idx);
                            const summary = nextG
                              .map((item) => (item.fullName ? `${item.fullName} (${item.relationship})` : ""))
                              .filter(Boolean)
                              .join(", ");
                            return { ...prev, guardians: nextG, guardianName: summary };
                          });
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-3 border-t pt-4">
            <h4 className="font-semibold text-sm mb-3">Residential Address</h4>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label>Address Line 1 *</Label>
                <Input
                  required
                  placeholder="House No, Street, Landmark"
                  value={form.resAddressLine1}
                  onChange={(e) => handleChange("resAddressLine1", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  placeholder="City"
                  value={form.resCity}
                  onChange={(e) => handleChange("resCity", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  placeholder="State"
                  value={form.resState}
                  onChange={(e) => handleChange("resState", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Pincode</Label>
                <Input
                  placeholder="Pincode"
                  value={form.resPincode}
                  onChange={(e) => handleChange("resPincode", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-3 border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="sameAsRes"
                checked={form.sameAsResidential}
                onChange={(e) => handleChange("sameAsResidential", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="sameAsRes" className="cursor-pointer font-semibold text-sm">
                Permanent Address is same as Residential Address
              </Label>
            </div>

            {!form.sameAsResidential && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <Label>Permanent Address Line 1</Label>
                  <Input
                    placeholder="House No, Street, Landmark"
                    value={form.permAddressLine1}
                    onChange={(e) => handleChange("permAddressLine1", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permanent City</Label>
                  <Input
                    placeholder="City"
                    value={form.permCity}
                    onChange={(e) => handleChange("permCity", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permanent State</Label>
                  <Input
                    placeholder="State"
                    value={form.permState}
                    onChange={(e) => handleChange("permState", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permanent Pincode</Label>
                  <Input
                    placeholder="Pincode"
                    value={form.permPincode}
                    onChange={(e) => handleChange("permPincode", e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 5. Previous Education & Transport */}
      <Card>
        <CardHeader>
          <CardTitle>5. Previous Education & Transport</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Previous School Name</Label>
            <Input
              placeholder="Name of previous school attended"
              value={form.previousSchoolName}
              onChange={(e) => handleChange("previousSchoolName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Previous Class</Label>
            <Input
              placeholder="e.g. Grade 4"
              value={form.previousClass}
              onChange={(e) => handleChange("previousClass", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Previous Board</Label>
            <Input
              placeholder="e.g. CBSE, ICSE, State Board"
              value={form.previousBoard}
              onChange={(e) => handleChange("previousBoard", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>TC (Transfer Certificate) No</Label>
            <Input
              placeholder="TC Number"
              value={form.tcNumber}
              onChange={(e) => handleChange("tcNumber", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Reason for Leaving</Label>
            <Input
              placeholder="Reason for leaving previous school"
              value={form.previousReason}
              onChange={(e) => handleChange("previousReason", e.target.value)}
            />
          </div>

          {/* Additional Previous Schools */}
          <div className="md:col-span-3 border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold text-sm">Additional Previous Schools</Label>
                <p className="text-xs text-muted-foreground">Add any other schools attended before if any.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    additionalSchools: [
                      ...prev.additionalSchools,
                      {
                        id: Math.random().toString(36).substring(2, 9),
                        schoolName: "",
                        class: "",
                        tcNumber: "",
                        tcDate: "",
                      },
                    ],
                  }));
                }}
              >
                + Add School
              </Button>
            </div>

            {form.additionalSchools.map((s, idx) => (
              <div key={s.id || idx} className="grid gap-3 rounded-md border p-3 bg-muted/20 md:grid-cols-4 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">School Name</Label>
                  <Input
                    placeholder="School Name"
                    value={s.schoolName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => {
                        const next = [...prev.additionalSchools];
                        next[idx] = { ...next[idx], schoolName: val };
                        return { ...prev, additionalSchools: next };
                      });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Class</Label>
                  <Input
                    placeholder="Class"
                    value={s.class}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => {
                        const next = [...prev.additionalSchools];
                        next[idx] = { ...next[idx], class: val };
                        return { ...prev, additionalSchools: next };
                      });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">TC No</Label>
                  <Input
                    placeholder="TC No"
                    value={s.tcNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => {
                        const next = [...prev.additionalSchools];
                        next[idx] = { ...next[idx], tcNumber: val };
                        return { ...prev, additionalSchools: next };
                      });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        additionalSchools: prev.additionalSchools.filter((_, i) => i !== idx),
                      }));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t pt-4 md:col-span-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="transportReq"
                checked={form.transportRequired}
                onChange={(e) => handleChange("transportRequired", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="transportReq" className="cursor-pointer font-semibold text-sm">
                School Transport Required
              </Label>
            </div>
            {form.transportRequired && (
              <div className="mt-3 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Preferred Pickup / Drop Stop</Label>
                    <Input
                      placeholder="e.g. Sector 14 stop"
                      value={form.transportPickupPoint}
                      onChange={(e) => handleChange("transportPickupPoint", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Route</Label>
                    <Input
                      placeholder="e.g. Route A"
                      value={form.transportRoute}
                      onChange={(e) => handleChange("transportRoute", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Vehicle No / Name</Label>
                    <Input
                      placeholder="e.g. Bus 12"
                      value={form.transportVehicle}
                      onChange={(e) => handleChange("transportVehicle", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Driver Name</Label>
                    <Input
                      placeholder="Driver Name"
                      value={form.transportDriver}
                      onChange={(e) => handleChange("transportDriver", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Driver Contact No</Label>
                    <Input
                      placeholder="Driver Phone"
                      value={form.transportDriverContact}
                      onChange={(e) => handleChange("transportDriverContact", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between max-w-sm">
                    <Label className="text-xs font-semibold text-muted-foreground">Additional Stops / Routes</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          additionalTransportStops: [
                            ...prev.additionalTransportStops,
                            { id: Math.random().toString(36).substring(2, 9), stop: "" },
                          ],
                        }));
                      }}
                    >
                      + Add Stop
                    </Button>
                  </div>

                  {form.additionalTransportStops.map((st, idx) => (
                    <div key={st.id || idx} className="flex gap-2 items-center max-w-sm">
                      <Input
                        placeholder="Alternative stop point"
                        value={st.stop}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm((prev) => {
                            const next = [...prev.additionalTransportStops];
                            next[idx] = { ...next[idx], stop: val };
                            return { ...prev, additionalTransportStops: next };
                          });
                        }}
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive px-2"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            additionalTransportStops: prev.additionalTransportStops.filter((_, i) => i !== idx),
                          }));
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 5b. Medical Details */}
      <Card>
        <CardHeader>
          <CardTitle>5b. Medical Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Allergies</Label>
            <Input
              placeholder="e.g. Peanuts, Dust, Penicillin"
              value={form.allergies}
              onChange={(e) => handleChange("allergies", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Medical Conditions</Label>
            <Input
              placeholder="e.g. Asthma, Diabetes"
              value={form.conditions}
              onChange={(e) => handleChange("conditions", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Disability (if any)</Label>
            <Input
              placeholder="e.g. Visual Impairment, None"
              value={form.disability}
              onChange={(e) => handleChange("disability", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Emergency Remarks / Notes</Label>
            <Input
              placeholder="Emergency Contact, Doctor Notes, etc."
              value={form.emergencyRemarks}
              onChange={(e) => handleChange("emergencyRemarks", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 6. Declaration & Submit */}
      <Card>
        <CardHeader>
          <CardTitle>6. Declaration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="declarationAcc"
              checked={form.declarationAccepted}
              onChange={(e) => handleChange("declarationAccepted", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="declarationAcc" className="cursor-pointer text-sm">
              I hereby declare that the information provided above is true and correct to the best of my knowledge.
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : mode === "admission" ? "Submit Admission Application" : "Create Active Student"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

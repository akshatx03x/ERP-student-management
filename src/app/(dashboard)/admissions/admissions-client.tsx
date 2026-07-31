"use client";

import { useState, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  createAdmissionAction,
  approveAdmissionAction,
  rejectAdmissionAction,
} from "@/server/actions/ops.actions";
import { findFamilyByPhoneAction } from "@/server/actions/family.actions";
import { formatDate } from "@/lib/utils";
import { UnifiedStudentForm, type UnifiedFormState } from "@/components/shared/unified-student-form";

type Admission = {
  id: string;
  applicantName: string;
  dateOfBirth: Date | string;
  status: string;
  admissionNo: string | null;
  phone: string | null;
  photoUrl?: string | null;
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
  const [activeTab, setActiveTab] = useState<"form" | "approvals">("form");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [pending, startTransition] = useTransition();
  const [matchDialog, setMatchDialog] = useState<MatchedFamily | null>(null);
  const [approvingApp, setApprovingApp] = useState<Admission | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [selectedAdmissionNo, setSelectedAdmissionNo] = useState<string>("");
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [pendingSubmitState, setPendingSubmitState] = useState<UnifiedFormState | null>(null);

  const pendingCount = useMemo(() => admissions.filter((a) => a.status === "PENDING").length, [admissions]);
  const approvedCount = useMemo(() => admissions.filter((a) => a.status === "APPROVED").length, [admissions]);
  const rejectedCount = useMemo(() => admissions.filter((a) => a.status === "REJECTED").length, [admissions]);

  const filteredAdmissions = useMemo(() => {
    return admissions.filter((a) => {
      if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = a.applicantName.toLowerCase().includes(query);
        const matchAdm = a.admissionNo?.toLowerCase().includes(query);
        const matchPhone = a.phone?.toLowerCase().includes(query);
        const matchClass = a.appliedClass.name.toLowerCase().includes(query);
        return matchName || matchAdm || matchPhone || matchClass;
      }
      return true;
    });
  }, [admissions, statusFilter, searchQuery]);

  async function handleUnifiedSubmit(formState: UnifiedFormState) {
    const phoneTrimmed = formState.phone.trim();
    if (!selectedFamilyId && phoneTrimmed) {
      const existing = await findFamilyByPhoneAction(phoneTrimmed);
      if (existing) {
        setPendingSubmitState(formState);
        setMatchDialog(existing);
        return;
      }
    }
    await executeSubmit(formState, selectedFamilyId);
  }

  async function executeSubmit(formState: UnifiedFormState, familyId: string | null, allowDuplicate: boolean = false) {
    const result = await createAdmissionAction({
      sessionId: formState.sessionId,
      appliedClassId: formState.appliedClassId,
      applicantName: formState.applicantName.trim(),
      dateOfBirth: new Date(formState.dateOfBirth),
      gender: formState.gender ? (formState.gender as "MALE" | "FEMALE" | "OTHER") : null,
      religion: formState.religion.trim() || null,
      category: formState.category ? (formState.category as any) : null,
      aadhaar: formState.aadhaar.trim() || null,
      apaarId: formState.apaarId.trim() || null,
      penId: formState.penId.trim() || null,

      fatherName: formState.fatherName.trim() || null,
      fatherQualification: formState.fatherQualification.trim() || null,
      fatherOccupation: formState.fatherOccupation.trim() || null,
      fatherDesignation: formState.fatherDesignation.trim() || null,
      fatherAnnualIncome: formState.fatherAnnualIncome ? Number(formState.fatherAnnualIncome) : null,
      fatherOfficeAddress: formState.fatherOfficeAddress.trim() || null,
      fatherPhone: formState.fatherPhone.trim() || null,
      fatherAadhaar: formState.fatherAadhaar.trim() || null,

      motherName: formState.motherName.trim() || null,
      motherQualification: formState.motherQualification.trim() || null,
      motherIsWorking: formState.motherIsWorking,
      motherOccupation: formState.motherOccupation.trim() || null,
      motherDesignation: formState.motherDesignation.trim() || null,
      motherAnnualIncome: formState.motherAnnualIncome ? Number(formState.motherAnnualIncome) : null,
      motherOfficeAddress: formState.motherOfficeAddress.trim() || null,
      motherPhone: formState.motherPhone.trim() || null,
      motherAadhaar: formState.motherAadhaar.trim() || null,

      guardianName: formState.guardianName.trim() || null,
      phone: formState.phone.trim() || null,
      address: formState.resAddressLine1.trim() || null,
      resAddressLine1: formState.resAddressLine1.trim() || null,
      resAddressLine2: formState.resAddressLine2.trim() || null,
      resCity: formState.resCity.trim() || null,
      resState: formState.resState.trim() || null,
      resPincode: formState.resPincode.trim() || null,
      sameAsResidential: formState.sameAsResidential,
      permAddressLine1: formState.permAddressLine1.trim() || null,
      permAddressLine2: formState.permAddressLine2.trim() || null,
      permCity: formState.permCity.trim() || null,
      permState: formState.permState.trim() || null,
      permPincode: formState.permPincode.trim() || null,

      previousSchoolName: formState.previousSchoolName.trim() || null,
      previousClass: formState.previousClass.trim() || null,
      tcNumber: formState.tcNumber.trim() || null,
      tcDate: formState.tcDate ? new Date(formState.tcDate) : null,

      transportRequired: formState.transportRequired,
      transportPickupPoint: formState.transportPickupPoint.trim() || null,

      declarationAccepted: formState.declarationAccepted,
      declarationDate: formState.declarationDate ? new Date(formState.declarationDate) : null,
      declarationParentName: formState.declarationParentName.trim() || null,
      admissionDate: formState.admissionDate ? new Date(formState.admissionDate) : new Date(),
      admissionNo: formState.admissionNo.trim() || null,
      photoUrl: formState.photoUrl || null,
      familyId,
      allowDuplicate,
    });

    if (!result.success) {
      toast.error(result.error || "Failed to save admission application");
      return;
    }

    toast.success("Admission application saved successfully");
    setMatchDialog(null);
    setPendingSubmitState(null);
    // Switch to approvals tab to see the newly submitted application
    setActiveTab("approvals");
  }

  function confirmUseExisting() {
    if (!matchDialog || !pendingSubmitState) return;
    executeSubmit(pendingSubmitState, matchDialog.id);
  }

  function confirmCreateNew() {
    if (!pendingSubmitState) return;
    executeSubmit(pendingSubmitState, null);
  }

  return (
    <div className="space-y-6">
      {/* Top Segmented Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3">
        <div className="inline-flex rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setActiveTab("form")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              activeTab === "form"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>New Application</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("approvals")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              activeTab === "approvals"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Approvals Queue</span>
            {pendingCount > 0 ? (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                {pendingCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* Quick Tab Stats */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Total: <strong>{admissions.length}</strong></span>
          <span className="text-amber-600">Pending: <strong>{pendingCount}</strong></span>
          <span className="text-emerald-600">Approved: <strong>{approvedCount}</strong></span>
        </div>
      </div>

      {/* Tab 1: New Admission Form with scrollbar */}
      {activeTab === "form" ? (
        <div className="max-h-[75vh] overflow-y-auto pr-2 scrollbar-thin">
          <UnifiedStudentForm
            classes={classes}
            sessions={sessions}
            currentSessionId={currentSessionId}
            mode="admission"
            onSubmit={handleUnifiedSubmit}
          />
        </div>
      ) : null}

      {/* Tab 2: Dedicated Approval & Applications Queue Section */}
      {activeTab === "approvals" ? (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
            <div>
              <CardTitle className="text-lg">Admission Applications Queue</CardTitle>
              <p className="text-xs text-muted-foreground">
                Review pending applications, select section assignments, and approve or reject students.
              </p>
            </div>

            {/* Status Filter Buttons & Search */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search applicant or admission no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-60 h-8 text-xs"
              />
              <div className="inline-flex rounded-md border bg-muted/50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === "ALL" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  All ({admissions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("PENDING")}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === "PENDING" ? "bg-background text-amber-700 font-bold shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  Pending ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("APPROVED")}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === "APPROVED" ? "bg-background text-emerald-700 font-bold shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  Approved ({approvedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("REJECTED")}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === "REJECTED" ? "bg-background text-destructive font-bold shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  Rejected ({rejectedCount})
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {/* Scrollable Container for Applications Queue */}
            <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-3 scrollbar-thin">
              {filteredAdmissions.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No admission applications found matching the selected filter.
                </div>
              ) : (
                filteredAdmissions.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/10 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-muted-foreground font-semibold text-sm">
                        {a.photoUrl ? (
                          <img src={a.photoUrl} alt={a.applicantName} className="h-full w-full object-cover" />
                        ) : (
                          a.applicantName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-base">{a.applicantName}</span>
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
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Class: <strong className="text-foreground">{a.appliedClass.name}</strong> · Session: <strong>{a.session.name}</strong> · DOB: <strong>{formatDate(a.dateOfBirth)}</strong>
                          {a.admissionNo ? ` · Adm No: ${a.admissionNo}` : ""}
                          {a.phone ? ` · Mobile: ${a.phone}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
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
                              setSelectedAdmissionNo(a.admissionNo || "");
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
                                  const result = await rejectAdmissionAction({ id: a.id, remarks: "Rejected" });
                                  if (!result.success) {
                                    toast.error(result.error || "Failed to reject admission");
                                    return;
                                  }
                                  toast.success("Application rejected");
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Failed");
                                }
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono">
                          {a.admissionNo ? `Assigned ID: ${a.admissionNo}` : "Processed"}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Existing Family Match Modal */}
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
                  {matchDialog.primaryPhone || pendingSubmitState?.phone || "—"}
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium">This family already has the following students:</p>
                {matchDialog.students.length === 0 ? (
                  <p className="text-muted-foreground">No students linked yet.</p>
                ) : (
                  <ul className="list-inside list-disc space-y-1">
                    {matchDialog.students.map((s) => {
                      const isSameStudent = pendingSubmitState && s.fullName.trim().toLowerCase() === pendingSubmitState.applicantName.trim().toLowerCase();
                      return (
                        <li key={s.id} className={isSameStudent ? "font-semibold text-destructive" : ""}>
                          {s.fullName}
                          {s.admissionNo ? (
                            <span className="text-muted-foreground"> ({s.admissionNo})</span>
                          ) : null}
                          {isSameStudent && <span className="ml-2 text-xs text-destructive font-bold">(Same Student)</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {pendingSubmitState && matchDialog.students.some((s) => s.fullName.trim().toLowerCase() === pendingSubmitState.applicantName.trim().toLowerCase()) ? (
                <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 space-y-1">
                  <p className="font-semibold text-sm">⚠️ Duplicate Student Warning</p>
                  <p className="text-xs text-amber-800">
                    A student named <strong>{pendingSubmitState.applicantName}</strong> already belongs to this family. Closing is recommended to avoid duplicate student records.
                  </p>
                </div>
              ) : (
                <p>Do you want to add this student to the same family?</p>
              )}

              <div className="flex flex-wrap gap-2">
                {pendingSubmitState && matchDialog.students.some((s) => s.fullName.trim().toLowerCase() === pendingSubmitState.applicantName.trim().toLowerCase()) ? (
                  <>
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => setMatchDialog(null)}
                    >
                      Close (Recommended)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      loading={pending}
                      onClick={() => {
                        if (!pendingSubmitState || !matchDialog) return;
                        startTransition(async () => {
                          await executeSubmit(pendingSubmitState, matchDialog.id, true);
                        });
                      }}
                    >
                      Save & Add Duplicate Anyway
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" loading={pending} onClick={confirmUseExisting}>
                      Use existing family
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      loading={pending}
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
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Section Assignment & Approval Modal */}
      {approvingApp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader>
              <CardTitle>Approve Admission — {approvingApp.applicantName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Admission No *</Label>
                <Input
                  required
                  placeholder="e.g. ADM-2026-0001"
                  value={selectedAdmissionNo}
                  onChange={(e) => setSelectedAdmissionNo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Select Section *</Label>
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
                  loading={pending}
                  disabled={!selectedSectionId || !selectedAdmissionNo.trim()}
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        const result = await approveAdmissionAction({
                          id: approvingApp.id,
                          sectionId: selectedSectionId,
                          admissionNo: selectedAdmissionNo.trim(),
                        });
                        if (!result.success) {
                          toast.error(result.error || "Failed to approve admission");
                          return;
                        }
                        toast.success("Approved successfully");
                        setApprovingApp(null);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed");
                      }
                    });
                  }}
                >
                  Confirm Approval
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

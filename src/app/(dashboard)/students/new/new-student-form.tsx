"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createStudentWithFamilyAction } from "@/server/actions/student.actions";
import { findFamilyByPhoneAction } from "@/server/actions/family.actions";
import { cn } from "@/lib/utils";
import { UnifiedStudentForm, type UnifiedFormState } from "@/components/shared/unified-student-form";

type ClassRow = { id: string; name: string; sections: Array<{ id: string; name: string }> };
type Session = { id: string; name: string };

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
  const [duplicateAlert, setDuplicateAlert] = useState<{ message: string; formState: UnifiedFormState } | null>(null);

  async function executeDirectSubmit(formState: UnifiedFormState, allowDuplicate: boolean = false) {
    let familyId: string | null = null;
    if (formState.phone.trim()) {
      const existing = await findFamilyByPhoneAction(formState.phone.trim());
      if (existing) {
        familyId = existing.id;
      }
    }

    const result = await createStudentWithFamilyAction({
      admissionNo: formState.admissionNo.trim(),
      firstName: formState.firstName.trim(),
      middleName: formState.middleName.trim() || null,
      lastName: formState.lastName.trim() || null,
      dateOfBirth: new Date(formState.dateOfBirth),
      gender: formState.gender ? (formState.gender as "MALE" | "FEMALE" | "OTHER") : null,
      bloodGroup: null,
      aadhaar: formState.aadhaar.trim() || null,
      religion: formState.religion.trim() || null,
      category: formState.category ? (formState.category as any) : null,
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
      phone: formState.phone.trim(),
      secondaryPhone: formState.secondaryPhone.trim() || null,
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
      photoUrl: formState.photoUrl || null,
      familyId,
      allowDuplicate,
      createLogin: true,
      status: "ACTIVE",
      enroll: true,
      sessionId: formState.sessionId,
      classId: formState.appliedClassId,
      sectionId: formState.sectionId,
      rollNo: formState.rollNo.trim() || null,
    });

    if (!result.success) {
      if (result.error && (result.error.includes("already registered") || result.error.includes("already enrolled"))) {
        setDuplicateAlert({ message: result.error, formState });
        return;
      }
      toast.error(result.error || "Failed to add student");
      return;
    }

    toast.success("Student created successfully");
    setDuplicateAlert(null);
    router.push("/students");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/students" className={cn(buttonVariants({ variant: "ghost" }))}>
          ← Back to Students
        </Link>
      </div>

      <UnifiedStudentForm
        classes={classes}
        sessions={sessions}
        currentSessionId={currentSessionId}
        mode="direct"
        onSubmit={(state) => executeDirectSubmit(state, false)}
      />

      {duplicateAlert ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md shadow-lg border-amber-200">
            <CardHeader>
              <CardTitle className="text-amber-900">⚠️ Duplicate Student Warning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-xs">
                {duplicateAlert.message}
              </div>
              <p className="text-muted-foreground text-xs">
                Closing is recommended to avoid duplicate student entries in the school. Do you want to proceed anyway?
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => setDuplicateAlert(null)}
                >
                  Close (Recommended)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  loading={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await executeDirectSubmit(duplicateAlert.formState, true);
                    });
                  }}
                >
                  Save & Add Duplicate Anyway
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}


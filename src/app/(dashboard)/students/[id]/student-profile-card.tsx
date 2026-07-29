"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { EditStudentForm } from "./edit-student-form";
import { deleteStudentAction } from "@/server/actions/student.actions";

export function StudentProfileCard({
  student,
  isStudentSelf,
  currentEnrollment,
  canDelete,
  isEditing: isEditingProp,
  onEditClose,
}: {
  student: {
    id: string;
    admissionNo: string;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
    fullName: string;
    dateOfBirth: string | Date;
    gender: string | null;
    bloodGroup: string | null;
    aadhaar: string | null;
    religion?: string | null;
    category?: string | null;
    apaarId?: string | null;
    penId?: string | null;
    previousSchoolName?: string | null;
    transportRequired?: boolean;
    transportPickupPoint?: string | null;
    photoDocumentId?: string | null;
    photoUrl?: string | null;
    status: string;
    familyId: string;
    user: { email: string } | null;
  };
  isStudentSelf: boolean;
  currentEnrollment: {
    rollNo: string | null;
    class: { name: string };
    section: { name: string };
    session: { name: string };
  } | null;
  canDelete: boolean;
  /** Controlled from page-level Actions dropdown */
  isEditing?: boolean;
  onEditClose?: () => void;
}) {
  const router = useRouter();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  // Support both controlled (page Actions) and internal edit mode
  const isEditing = isEditingProp ?? false;
  const closeEdit = () => { onEditClose?.(); };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteStudentAction(student.id);
        toast.success("Student deleted successfully");
        router.push("/students");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete student");
        setShowConfirmDelete(false);
      }
    });
  };

  if (isEditing) {
    return (
      <Card className="border-border">
        <CardHeader className="px-4 py-3 border-b">
          <p className="text-sm font-semibold text-foreground">Edit Student Profile</p>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <EditStudentForm
            student={student}
            onCancel={closeEdit}
            onSaved={() => {
              closeEdit();
              router.refresh();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  const initials = student.fullName
    ? student.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "ST";

  const avatarColorClass =
    student.gender === "MALE"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
      : student.gender === "FEMALE"
        ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
        : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";

  return (
    <Card className="border-border">
      {/* Card Header: Avatar + Name + Key Identifiers */}
      <CardHeader className="px-5 py-5 border-b">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div
            className={`relative flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 text-2xl font-bold shadow-md ${avatarColorClass}`}
          >
            {student.photoUrl ? (
              <img src={student.photoUrl} alt={student.fullName} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold leading-tight text-foreground">
              {student.fullName}
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              <span className="text-xs text-muted-foreground">
                Adm.{" "}
                <span className="font-medium text-foreground">{student.admissionNo}</span>
              </span>
              {currentEnrollment && (
                <>
                  <span className="text-muted-foreground/40 text-xs">·</span>
                  <span className="text-xs text-muted-foreground">
                    Class{" "}
                    <span className="font-medium text-foreground">
                      {currentEnrollment.class.name}&#8209;{currentEnrollment.section.name}
                    </span>
                  </span>
                  <span className="text-muted-foreground/40 text-xs">·</span>
                  <span className="text-xs text-muted-foreground">
                    {currentEnrollment.session.name}
                  </span>
                </>
              )}
              <Badge
                variant={student.status === "ACTIVE" ? "success" : "secondary"}
                className="h-5 px-2 text-[10px] font-semibold"
              >
                {student.status}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-4">
        {showConfirmDelete ? (
          <div className="rounded border border-destructive/40 bg-destructive/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-destructive">
              Permanently delete this student record?
            </p>
            <p className="text-xs text-muted-foreground">
              This will remove the student along with payment history, attendance, and exam grades.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-4 text-sm"
                onClick={() => setShowConfirmDelete(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 px-4 text-sm"
                onClick={handleDelete}
                disabled={pending}
              >
                {pending ? "Deleting…" : "Yes, Delete"}
              </Button>
            </div>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <span className="block text-xs uppercase tracking-wider font-medium text-muted-foreground mb-1">
                Gender
              </span>
              <span className="text-sm font-medium text-foreground">{student.gender || "—"}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider font-medium text-muted-foreground mb-1">
                Date of Birth
              </span>
              <span className="text-sm font-medium text-foreground">
                {formatDate(student.dateOfBirth)}
              </span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider font-medium text-muted-foreground mb-1">
                Category / Religion
              </span>
              <span className="text-sm font-medium text-foreground">
                {student.category || "—"} {student.religion ? `(${student.religion})` : ""}
              </span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider font-medium text-muted-foreground mb-1">
                Roll Number
              </span>
              <span className="text-sm font-medium text-foreground">
                {currentEnrollment?.rollNo || "—"}
              </span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider font-medium text-muted-foreground mb-1">
                Aadhaar Number
              </span>
              <span className="text-sm font-medium text-foreground">
                {student.aadhaar || "—"}
              </span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider font-medium text-muted-foreground mb-1">
                APAAR ID / PEN ID
              </span>
              <span className="text-sm font-medium text-foreground">
                {student.apaarId || "—"} {student.penId ? `/ ${student.penId}` : ""}
              </span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider font-medium text-muted-foreground mb-1">
                Previous School
              </span>
              <span className="text-sm font-medium text-foreground">
                {student.previousSchoolName || "—"}
              </span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider font-medium text-muted-foreground mb-1">
                Transport
              </span>
              <span className="text-sm font-medium text-foreground">
                {student.transportRequired ? `Required (${student.transportPickupPoint || "Stop specified"})` : "Not Required"}
              </span>
            </div>
          </div>
          {canDelete && (
            <div className="mt-5 pt-4 border-t flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-4 text-xs text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                onClick={() => setShowConfirmDelete(true)}
              >
                Delete Student
              </Button>
            </div>
          )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

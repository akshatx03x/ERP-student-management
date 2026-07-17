"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { updateStudentAction } from "@/server/actions/student.actions";
import type { UpdateStudentInput } from "@/server/validators/student.validator";

export function EditStudentForm({
  student,
  onCancel,
  onSaved,
}: {
  student: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
    dateOfBirth: string | Date;
    gender: string | null;
    bloodGroup: string | null;
    aadhaar: string | null;
    status: string;
  };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

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
    gender: student.gender ?? "",
    bloodGroup: student.bloodGroup ?? "",
    aadhaar: student.aadhaar ?? "",
    status: student.status,
  });

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
          gender: (form.gender as "MALE" | "FEMALE" | "OTHER") || null,
          bloodGroup: form.bloodGroup.trim() || null,
          aadhaar: form.aadhaar.trim() || null,
          status: form.status as "ACTIVE" | "INACTIVE" | "TRANSFERRED" | "ALUMNI",
        };

        await updateStudentAction(input);
        toast.success("Student profile updated successfully");
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update profile");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="grid gap-4 sm:grid-cols-3">
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
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="TRANSFERRED">Transferred</option>
            <option value="ALUMNI">Alumni</option>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

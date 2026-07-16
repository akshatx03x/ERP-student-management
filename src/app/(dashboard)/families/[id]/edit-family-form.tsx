"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { updateFamilyAction } from "@/server/actions/family.actions";
import type { UpdateFamilyInput } from "@/server/validators/family.validator";

export function EditFamilyForm({
  family,
  onCancel,
  onSaved,
}: {
  family: {
    id: string;
    familyCode: string | null;
    fatherName: string | null;
    motherName: string | null;
    guardianName: string | null;
    primaryPhone: string | null;
    secondaryPhone: string | null;
    email: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    familyCode: family.familyCode ?? "",
    fatherName: family.fatherName ?? "",
    motherName: family.motherName ?? "",
    guardianName: family.guardianName ?? "",
    primaryPhone: family.primaryPhone ?? "",
    secondaryPhone: family.secondaryPhone ?? "",
    email: family.email ?? "",
    addressLine1: family.addressLine1 ?? "",
    addressLine2: family.addressLine2 ?? "",
    city: family.city ?? "",
    state: family.state ?? "",
    pincode: family.pincode ?? "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.primaryPhone.trim()) {
      toast.error("Primary Phone is required");
      return;
    }

    startTransition(async () => {
      try {
        const input: UpdateFamilyInput = {
          id: family.id,
          familyCode: form.familyCode.trim() || null,
          fatherName: form.fatherName.trim() || null,
          motherName: form.motherName.trim() || null,
          guardianName: form.guardianName.trim() || null,
          primaryPhone: form.primaryPhone.trim(),
          secondaryPhone: form.secondaryPhone.trim(),
          email: form.email.trim() || null,
          addressLine1: form.addressLine1.trim() || null,
          addressLine2: form.addressLine2.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          pincode: form.pincode.trim() || null,
        };

        await updateFamilyAction(input);
        toast.success("Family details updated successfully");
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update family details");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="familyCode">Family Code</Label>
          <Input
            id="familyCode"
            placeholder="VPS-FAM-01"
            value={form.familyCode}
            onChange={(e) => setForm((f) => ({ ...f, familyCode: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fatherName">Father&apos;s name</Label>
          <Input
            id="fatherName"
            value={form.fatherName}
            onChange={(e) => setForm((f) => ({ ...f, fatherName: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="motherName">Mother&apos;s name</Label>
          <Input
            id="motherName"
            value={form.motherName}
            onChange={(e) => setForm((f) => ({ ...f, motherName: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="guardianName">Guardian&apos;s name</Label>
          <Input
            id="guardianName"
            value={form.guardianName}
            onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="primaryPhone">Primary Phone (Mobile)</Label>
          <Input
            id="primaryPhone"
            value={form.primaryPhone}
            onChange={(e) => setForm((f) => ({ ...f, primaryPhone: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="secondaryPhone">Secondary Phone</Label>
          <Input
            id="secondaryPhone"
            value={form.secondaryPhone}
            onChange={(e) => setForm((f) => ({ ...f, secondaryPhone: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="parents@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="addressLine1">Address Line 1</Label>
          <Input
            id="addressLine1"
            value={form.addressLine1}
            onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
          <Input
            id="addressLine2"
            value={form.addressLine2}
            onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pincode">Pincode</Label>
          <Input
            id="pincode"
            value={form.pincode}
            onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

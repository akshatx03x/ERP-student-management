"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EditFamilyForm } from "./edit-family-form";

export function FamilyProfileCards({
  family,
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
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Edit Family Details</CardTitle>
        </CardHeader>
        <CardContent>
          <EditFamilyForm
            family={family}
            onCancel={() => setIsEditing(false)}
            onSaved={() => {
              setIsEditing(false);
              router.refresh();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>Parent information</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            Edit Family
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {family.familyCode && (
            <p>
              <span className="text-muted-foreground font-medium">Family Code:</span>{" "}
              {family.familyCode}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">Father:</span> {family.fatherName || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Mother:</span> {family.motherName || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Guardian:</span> {family.guardianName || "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact & address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Mobile:</span> {family.primaryPhone || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Secondary phone:</span> {family.secondaryPhone || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {family.email || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Address:</span>{" "}
            {[family.addressLine1, family.addressLine2, family.city, family.state, family.pincode]
              .filter(Boolean)
              .join(", ") || "—"}
          </p>
        </CardContent>
      </Card>
    </>
  );
}

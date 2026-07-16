"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { upsertMedicalAction } from "@/server/actions/student.actions";

export function StudentMedicalForm({
  studentId,
  initial,
}: {
  studentId: string;
  initial: { allergies: string; conditions: string; notes: string };
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Allergies</Label>
        <Textarea
          value={form.allergies}
          onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label>Conditions</Label>
        <Textarea
          value={form.conditions}
          onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await upsertMedicalAction({
                studentId,
                allergies: form.allergies || null,
                conditions: form.conditions || null,
                notes: form.notes || null,
              });
              toast.success("Medical info saved");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          })
        }
      >
        Save medical
      </Button>
    </div>
  );
}

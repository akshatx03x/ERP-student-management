"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createHolidayAction, deleteHolidayAction } from "@/server/actions/ops.actions";
import { formatDate } from "@/lib/utils";

type Holiday = {
  id: string;
  name: string;
  date: Date | string;
  type: string;
  description: string | null;
};

export function HolidaysClient({ holidays }: { holidays: Holiday[] }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ date: "", name: "", description: "", type: "SCHOOL" });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Add holiday</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="NATIONAL">National</option>
            <option value="RELIGIOUS">Religious</option>
            <option value="SCHOOL">School</option>
            <option value="OTHER">Other</option>
          </Select>
          <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Button
            disabled={pending || !form.date || !form.name}
            onClick={() =>
              startTransition(async () => {
                try {
                  await createHolidayAction({
                    date: new Date(form.date),
                    name: form.name,
                    description: form.description || null,
                    type: form.type as "NATIONAL" | "RELIGIOUS" | "SCHOOL" | "OTHER",
                  });
                  toast.success("Holiday added");
                  setForm({ date: "", name: "", description: "", type: "SCHOOL" });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              })
            }
          >
            Add
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {holidays.map((h) => (
          <div key={h.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">{h.name}</p>
              <p className="text-sm text-muted-foreground">{formatDate(h.date)} · {h.type}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await deleteHolidayAction(h.id);
                    toast.success("Deleted");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                })
              }
            >
              Delete
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

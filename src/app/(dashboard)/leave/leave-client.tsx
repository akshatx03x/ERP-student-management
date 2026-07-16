"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createLeaveAction, reviewLeaveAction } from "@/server/actions/ops.actions";
import { formatDate } from "@/lib/utils";

type Leave = {
  id: string;
  reason: string;
  status: string;
  fromDate: Date | string;
  toDate: Date | string;
  student?: { fullName: string } | null;
};
type Student = { id: string; fullName: string };

export function LeaveClient({ leaves, students }: { leaves: Leave[]; students: Student[] }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    studentId: students[0]?.id ?? "",
    fromDate: "",
    toDate: "",
    reason: "",
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Request leave</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Select value={form.studentId} onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </Select>
          <Input type="date" value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
          <Input type="date" value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
          <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Reason" />
          <Button
            disabled={pending || !form.reason || !form.fromDate || !form.toDate}
            onClick={() =>
              startTransition(async () => {
                try {
                  await createLeaveAction({
                    requesterType: "STUDENT",
                    studentId: form.studentId,
                    fromDate: new Date(form.fromDate),
                    toDate: new Date(form.toDate),
                    reason: form.reason,
                  });
                  toast.success("Leave requested");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              })
            }
          >
            Submit
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {leaves.map((l) => (
          <div key={l.id} className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{l.student?.fullName ?? "Staff"}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(l.fromDate)} – {formatDate(l.toDate)} · {l.reason}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{l.status}</Badge>
              {l.status === "PENDING" ? (
                <>
                  <Button size="sm" disabled={pending} onClick={() => startTransition(async () => {
                    try {
                      await reviewLeaveAction({ id: l.id, status: "APPROVED" });
                      toast.success("Approved");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  })}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
                    try {
                      await reviewLeaveAction({ id: l.id, status: "REJECTED" });
                      toast.success("Rejected");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  })}>Reject</Button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { recordStudentExitAction } from "@/server/actions/student-exit.actions";

export function RecordExitModal({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    leavingDate: new Date().toISOString().split("T")[0],
    reason: "TRANSFERRED" as "TRANSFERRED" | "WITHDRAWN" | "GRADUATED" | "EXPELLED" | "OTHER",
    tcNumber: "",
    tcDate: new Date().toISOString().split("T")[0],
    remarks: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await recordStudentExitAction({
        studentId,
        leavingDate: new Date(form.leavingDate),
        reason: form.reason,
        tcNumber: form.tcNumber.trim() || null,
        tcDate: form.tcDate ? new Date(form.tcDate) : null,
        remarks: form.remarks.trim() || null,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to record student exit");
        return;
      }

      toast.success("Student exit recorded successfully");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        Record Student Exit
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base font-bold">Record Exit — {studentName}</CardTitle>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 pt-4 text-xs">
                <div className="space-y-1.5">
                  <Label>Leaving Date *</Label>
                  <Input
                    required
                    type="date"
                    value={form.leavingDate}
                    onChange={(e) => setForm((f) => ({ ...f, leavingDate: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Exit Reason *</Label>
                  <Select
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as any }))}
                  >
                    <option value="TRANSFERRED">Transferred</option>
                    <option value="WITHDRAWN">Withdrawn</option>
                    <option value="GRADUATED">Graduated (Alumni)</option>
                    <option value="EXPELLED">Expelled</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>TC Number</Label>
                    <Input
                      placeholder="e.g. TC-2026-089"
                      value={form.tcNumber}
                      onChange={(e) => setForm((f) => ({ ...f, tcNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>TC Date</Label>
                    <Input
                      type="date"
                      value={form.tcDate}
                      onChange={(e) => setForm((f) => ({ ...f, tcDate: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Remarks / Exit Notes</Label>
                  <Input
                    placeholder="Enter reason details or remarks..."
                    value={form.remarks}
                    onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                  />
                </div>

                <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-[11px] space-y-1.5">
                  <p className="font-bold flex items-center gap-1">⚠️ Student Exit Confirmation & Exclusion Warning</p>
                  <p>
                    Recording student exit will set student status to <strong>LEFT</strong> and permanently preserve all historical records while removing them from active operations:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 font-medium pl-1 text-[10.5px]">
                    <li>Daily Attendance & Class Rosters</li>
                    <li>Bulk Student Promotion & Class Allocation</li>
                    <li>Timetable Scheduling & Exam Generation</li>
                    <li>Active Student Lists & Future Fee Collection</li>
                  </ul>
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="destructive" loading={pending}>
                    Confirm Student Exit
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}

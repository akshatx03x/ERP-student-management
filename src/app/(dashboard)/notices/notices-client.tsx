"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createNoticeAction, deleteNoticeAction } from "@/server/actions/platform.actions";
import { formatDate } from "@/lib/utils";

type Notice = {
  id: string;
  title: string;
  body: string;
  audience: string;
  publishedAt: Date | string | null;
  isActive: boolean;
};

export function NoticesClient({ notices }: { notices: Notice[] }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ title: "", body: "", audience: "ALL" });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Publish notice</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
            <option value="ALL">All</option>
            <option value="STAFF">Staff</option>
            <option value="TEACHERS">Teachers</option>
            <option value="STUDENTS">Students</option>
            <option value="PARENTS">Parents</option>
          </Select>
          <Textarea placeholder="Body" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          <Button disabled={pending || !form.title || !form.body} onClick={() => startTransition(async () => {
            try {
              await createNoticeAction({
                title: form.title,
                body: form.body,
                audience: form.audience as "ALL" | "STAFF" | "TEACHERS" | "STUDENTS" | "PARENTS",
                publishedAt: new Date(),
                isActive: true,
              });
              toast.success("Published");
              setForm({ title: "", body: "", audience: "ALL" });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          })}>Publish</Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {notices.map((n) => (
          <div key={n.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{n.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.audience} · {n.publishedAt ? formatDate(n.publishedAt) : "Draft"}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{n.body}</p>
              </div>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
                try {
                  await deleteNoticeAction(n.id);
                  toast.success("Deleted");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              })}>Delete</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  createSessionAction,
  setCurrentSessionAction,
  closeSessionAction,
  archiveSessionAction,
} from "@/server/actions/session.actions";
import { formatDate } from "@/lib/utils";

type SessionRow = {
  id: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  status: string;
  isCurrent: boolean;
};

export function AcademicsClient({
  sessions,
  currentSessionId,
}: {
  sessions: SessionRow[];
  currentSessionId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function create() {
    startTransition(async () => {
      try {
        await createSessionAction({
          name,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: "DRAFT",
        });
        toast.success("Session created");
        setName("");
        setStartDate("");
        setEndDate("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create session");
      }
    });
  }

  function run(action: () => Promise<unknown>, ok: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create session</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2026-27"
            />
          </div>
          <div className="space-y-2">
            <Label>Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="md:col-span-4">
            <Button
              type="button"
              disabled={pending || !name || !startDate || !endDate}
              onClick={create}
            >
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{s.name}</p>
                {s.isCurrent || s.id === currentSessionId ? (
                  <Badge variant="success">Current</Badge>
                ) : null}
                <Badge variant="outline">{s.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(s.startDate)} – {formatDate(s.endDate)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || s.isCurrent}
                onClick={() => run(() => setCurrentSessionAction(s.id), "Current session set")}
              >
                Switch to current
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || s.status === "CLOSED"}
                onClick={() => run(() => closeSessionAction(s.id), "Session closed")}
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || s.status === "ARCHIVED"}
                onClick={() => run(() => archiveSessionAction(s.id), "Session archived")}
              >
                Archive
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RotateCcw, Lock, X } from "lucide-react";
import {
  createSessionAction,
  setCurrentSessionAction,
  closeSessionAction,
  reopenSessionAction,
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
  isPrincipal = false,
}: {
  sessions: SessionRow[];
  currentSessionId: string | null;
  isPrincipal?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [sessionToClose, setSessionToClose] = useState<SessionRow | null>(null);
  const [sessionToReopen, setSessionToReopen] = useState<SessionRow | null>(null);

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

  function handleConfirmClose() {
    if (!sessionToClose) return;
    const target = sessionToClose;
    startTransition(async () => {
      try {
        await closeSessionAction(target.id);
        toast.success(`Academic session ${target.name} has been closed.`);
        setSessionToClose(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to close session");
      }
    });
  }

  function handleConfirmReopen() {
    if (!sessionToReopen) return;
    const target = sessionToReopen;
    startTransition(async () => {
      try {
        await reopenSessionAction(target.id);
        toast.success(`Academic session ${target.name} reopened successfully.`);
        setSessionToReopen(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to reopen session");
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
        {sessions.map((s) => {
          const isClosed = s.status === "CLOSED";
          const isCurrent = s.isCurrent || s.id === currentSessionId;

          return (
            <div
              key={s.id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{s.name}</p>
                  {isCurrent ? (
                    <Badge variant="success">Current</Badge>
                  ) : null}
                  <Badge variant={isClosed ? "secondary" : "outline"}>
                    {s.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(s.startDate)} – {formatDate(s.endDate)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || isCurrent || isClosed}
                  onClick={() => run(() => setCurrentSessionAction(s.id), "Current session set")}
                >
                  Switch to current
                </Button>

                {!isClosed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || isCurrent}
                    onClick={() => setSessionToClose(s)}
                    className="text-stone-700 dark:text-stone-300 hover:text-amber-600 dark:hover:text-amber-400"
                  >
                    <Lock className="h-3.5 w-3.5 mr-1 text-stone-500" />
                    Close
                  </Button>
                ) : (
                  <>
                    {isPrincipal ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setSessionToReopen(s)}
                        className="text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 font-medium"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Reopen session
                      </Button>
                    ) : (
                      <span
                        className="inline-flex items-center text-xs text-muted-foreground bg-stone-100 dark:bg-stone-850 px-2.5 py-1.5 rounded border border-stone-200/60 dark:border-stone-800"
                        title="Only a Principal account can reopen a closed session"
                      >
                        <Lock className="h-3 w-3 mr-1 text-stone-400" />
                        Closed (Principal only)
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal for Closing a Session */}
      {sessionToClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Close Academic Session</h3>
                  <p className="text-xs text-stone-500">{sessionToClose.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSessionToClose(null)}
                disabled={pending}
                className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3 text-sm">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3.5 text-amber-900 dark:text-amber-200 leading-relaxed">
                <p className="font-semibold mb-1">Important Notice:</p>
                Closing this session will finalize all records (enrollments, examinations, and fee collections) for academic year <strong>{sessionToClose.name}</strong>.
              </div>

              <div className="space-y-1.5 text-xs text-stone-600 dark:text-stone-400">
                <p>• The session will no longer accept active enrollment changes.</p>
                <p>• Once closed, only a <strong>Principal account</strong> can reopen this session.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-stone-50 dark:bg-stone-900/50 border-t border-stone-100 dark:border-stone-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSessionToClose(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmClose}
                disabled={pending}
              >
                {pending ? "Closing..." : "Yes, Close Session"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Reopening a Session */}
      {sessionToReopen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Reopen Academic Session</h3>
                  <p className="text-xs text-stone-500">{sessionToReopen.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSessionToReopen(null)}
                disabled={pending}
                className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3 text-sm text-stone-600 dark:text-stone-300">
              <p>
                Are you sure you want to reopen academic session <strong>{sessionToReopen.name}</strong>?
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                This will change the session status from <strong>CLOSED</strong> back to <strong>ACTIVE</strong>.
              </p>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-stone-50 dark:bg-stone-900/50 border-t border-stone-100 dark:border-stone-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSessionToReopen(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleConfirmReopen}
                disabled={pending}
              >
                {pending ? "Reopening..." : "Reopen Session"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

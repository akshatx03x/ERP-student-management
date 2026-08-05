"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Download,
  Upload,
  DatabaseBackup,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Clock,
  HardDrive,
  Info,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createBackupAction } from "@/server/actions/backup.actions";
import { format } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────────────────

type BackupInfo = {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  schoolName: string;
  erpVersion: string;
  backupFormatVersion: number;
  sha256: string;
  label?: string;
};

type ValidationResult = {
  tempDbPath: string;
  metadata: {
    schoolName: string;
    createdAt: string;
    erpVersion: string;
    backupFormatVersion: number;
    label?: string;
    sha256: string;
  };
};

type BackupStep =
  | "idle"
  | "preparing"
  | "compressing"
  | "downloading"
  | "done"
  | "error";

type RestoreStep =
  | "idle"
  | "uploading"
  | "validating"
  | "confirm"
  | "clearing"
  | "restoring"
  | "finalizing"
  | "done"
  | "error";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatBackupDate(isoStr: string): { date: string; time: string } {
  const d = new Date(isoStr);
  return {
    date: format(d, "dd MMM yyyy"),
    time: format(d, "hh:mm a"),
  };
}

const BACKUP_STEP_LABELS: Record<BackupStep, string> = {
  idle: "",
  preparing: "Preparing backup…",
  compressing: "Compressing data…",
  downloading: "Downloading backup…",
  done: "Backup complete",
  error: "Backup failed",
};

const RESTORE_STEP_LABELS: Record<RestoreStep, string> = {
  idle: "",
  uploading: "Extracting Backup…",
  validating: "Reading Metadata & Validating Database…",
  confirm: "",
  clearing: "Creating Safety Backup…",
  restoring: "Replacing Database…",
  finalizing: "Restarting Database Connection…",
  done: "Restore complete",
  error: "Restore failed",
};

// ─── BackupInfoCard ─────────────────────────────────────────────────────────────

function BackupInfoCard({ backup }: { backup: BackupInfo }) {
  const { date, time } = formatBackupDate(backup.createdAt);
  return (
    <div className="grid gap-3 sm:grid-cols-3 mt-3">
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <Clock className="h-4 w-4 mt-0.5 text-indigo-500 shrink-0" />
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Last Backup</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{date}</p>
          <p className="text-xs text-slate-500">{time}</p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <HardDrive className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Backup Size</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatBytes(backup.sizeBytes)}</p>
          <p className="text-xs text-slate-500">{backup.schoolName}</p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <Info className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">ERP Backup v{backup.backupFormatVersion}</p>
          <p className="text-xs text-slate-500">v{backup.erpVersion}</p>
        </div>
      </div>
    </div>
  );
}

// ─── ProgressBanner ─────────────────────────────────────────────────────────────

function ProgressBanner({
  label,
  variant,
}: {
  label: string;
  variant: "progress" | "success" | "error";
}) {
  const colors = {
    progress: "bg-indigo-50 border-indigo-200 text-indigo-700",
    success: "bg-emerald-50 border-emerald-200 text-emerald-700",
    error: "bg-rose-50 border-rose-200 text-rose-700",
  };

  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium ${colors[variant]}`}>
      {variant === "progress" && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
      {variant === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
      {variant === "error" && <AlertTriangle className="h-4 w-4 shrink-0" />}
      {label}
    </div>
  );
}

const RESTORE_PROGRESS: Record<RestoreStep, { stage: string; percentage: number }> = {
  idle: { stage: "", percentage: 0 },
  uploading: { stage: "Extracting Backup", percentage: 10 },
  validating: { stage: "Reading Metadata & Validating Database", percentage: 40 },
  confirm: { stage: "Awaiting Confirmation...", percentage: 45 },
  clearing: { stage: "Creating Safety Backup", percentage: 60 },
  restoring: { stage: "Replacing Database", percentage: 80 },
  finalizing: { stage: "Restarting Database Connection", percentage: 90 },
  done: { stage: "Restore Complete", percentage: 100 },
  error: { stage: "Restore failed", percentage: 0 },
};

function RestoreProgressDialog({ step }: { step: RestoreStep }) {
  const { stage, percentage } = RESTORE_PROGRESS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 space-y-6 text-center">
        <div className="flex justify-center">
          <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-800">Restoring Database</h2>
          <p className="text-sm text-slate-500">{stage}</p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold text-slate-400">
            <span>Progress</span>
            <span>{percentage}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <p className="text-[10px] text-slate-400">
          Please do not close this tab or refresh the page. User interaction is disabled until restore completes.
        </p>
      </div>
    </div>
  );
}

// ─── ConfirmationDialog ─────────────────────────────────────────────────────────

function ConfirmationDialog({
  metadata,
  onConfirm,
  onCancel,
  isPending,
}: {
  metadata: ValidationResult["metadata"];
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { date, time } = formatBackupDate(metadata.createdAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
            </div>
            <h2 className="text-base font-bold text-slate-800">Confirm Database Restore</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3">
            <p className="text-sm text-rose-800 font-medium leading-relaxed">
              This operation will replace the current ERP data with the selected backup.{" "}
              <strong>This action cannot be undone.</strong> Are you sure you want to continue?
            </p>
          </div>

          {/* Backup details */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200 text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-slate-500 font-medium">School</span>
              <span className="text-slate-800 font-semibold">{metadata.schoolName}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-slate-500 font-medium">Backup Date</span>
              <span className="text-slate-800 font-semibold">{date} at {time}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-slate-500 font-medium">ERP Version</span>
              <span className="text-slate-800 font-semibold">v{metadata.erpVersion}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-slate-500 font-medium">Format</span>
              <span className="text-slate-800 font-semibold">ERP Backup v{metadata.backupFormatVersion}</span>
            </div>
            {metadata.label && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-slate-500 font-medium">Label</span>
                <span className="text-slate-800 font-semibold">{metadata.label}</span>
              </div>
            )}
            <div className="flex justify-between gap-4 px-4 py-2.5">
              <span className="text-slate-500 font-medium shrink-0">SHA-256</span>
              <span className="text-slate-600 font-mono text-xs break-all">{metadata.sha256.slice(0, 32)}…</span>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            ✓ Integrity verified &nbsp;·&nbsp; ✓ Format validated &nbsp;·&nbsp; ✓ Atomic restore
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            loading={isPending}
            id="confirm-restore-btn"
          >
            {isPending ? "Restoring…" : "Restore Database"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── BackupPanel ────────────────────────────────────────────────────────────────

export function BackupPanel({
  isPrincipal,
  lastBackup: initialLastBackup,
  compact = false,
}: {
  isPrincipal: boolean;
  lastBackup?: BackupInfo | null;
  compact?: boolean;
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [backupStep, setBackupStep] = useState<BackupStep>("idle");
  const [backupError, setBackupError] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<BackupInfo | null>(initialLastBackup ?? null);

  const [restoreStep, setRestoreStep] = useState<RestoreStep>("idle");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const [isBackupPending, startBackupTransition] = useTransition();
  const [isRestorePending, startRestoreTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBackupBusy =
    isBackupPending ||
    backupStep === "preparing" ||
    backupStep === "compressing" ||
    backupStep === "downloading";

  const isRestoreBusy =
    isRestorePending ||
    restoreStep === "uploading" ||
    restoreStep === "validating" ||
    restoreStep === "clearing" ||
    restoreStep === "restoring" ||
    restoreStep === "finalizing";

  // ── Backup Flow ────────────────────────────────────────────────────────────

  const handleBackup = useCallback(() => {
    if (isBackupBusy || !isPrincipal) return;

    setBackupError(null);
    setBackupStep("preparing");

    startBackupTransition(async () => {
      try {
        // Step 1: Create backup on server
        setBackupStep("preparing");
        const backup = await createBackupAction();

        // Step 2: Trigger download
        setBackupStep("downloading");
        const res = await fetch(`/api/backup/download?id=${encodeURIComponent(backup.id)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Download failed" }));
          throw new Error((err as { error?: string }).error ?? "Download failed");
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = backup.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Step 3: Update last backup info
        setLastBackup({
          id: backup.id,
          filename: backup.filename,
          sizeBytes: backup.sizeBytes,
          createdAt: backup.createdAt,
          schoolName: backup.schoolName,
          erpVersion: backup.erpVersion,
          backupFormatVersion: backup.backupFormatVersion,
          sha256: backup.sha256,
          ...(backup.label ? { label: backup.label } : {}),
        });

        setBackupStep("done");
        toast.success("Backup created and downloaded successfully.");

        // Reset after a moment
        setTimeout(() => setBackupStep("idle"), 3000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Backup failed";
        setBackupError(msg);
        setBackupStep("error");
        toast.error(msg);
        setTimeout(() => {
          setBackupStep("idle");
          setBackupError(null);
        }, 5000);
      }
    });
  }, [isBackupBusy, isPrincipal, startBackupTransition]);

  // ── Restore Flow ───────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    (file: File | null) => {
      if (!file || isRestoreBusy || !isPrincipal) return;

      setRestoreError(null);
      setValidation(null);
      setRestoreStep("uploading");

      startRestoreTransition(async () => {
        try {
          setRestoreStep("validating");

          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/backup/restore", {
            method: "POST",
            body: formData,
          });

          const data = await res.json() as { valid?: boolean; tempDbPath?: string; metadata?: ValidationResult["metadata"]; error?: string; code?: string };

          if (!res.ok || !data.valid) {
            throw new Error(data.error ?? "Validation failed");
          }

          setValidation({ tempDbPath: data.tempDbPath!, metadata: data.metadata! });
          setRestoreStep("confirm");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Validation failed";
          setRestoreError(msg);
          setRestoreStep("error");
          toast.error(msg);
          setTimeout(() => {
            setRestoreStep("idle");
            setRestoreError(null);
          }, 6000);
        } finally {
          // Clear file input
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      });
    },
    [isRestoreBusy, isPrincipal, startRestoreTransition],
  );

  const handleConfirmRestore = useCallback(() => {
    if (!validation || isRestoreBusy) return;

    setRestoreStep("clearing");

    startRestoreTransition(async () => {
      try {
        setRestoreStep("restoring");

        const res = await fetch("/api/backup/restore/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tempDbPath: validation.tempDbPath,
            backupFilename: `${validation.metadata.schoolName}_backup`,
          }),
        });

        const data = await res.json() as { success?: boolean; message?: string };

        setRestoreStep("finalizing");

        if (!res.ok || !data.success) {
          throw new Error(data.message ?? "Restore failed");
        }

        setRestoreStep("done");
        toast.success("Database restored successfully. Reloading ERP…");

        // Automatic refresh after successful restore — clears all in-memory state
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Restore failed";
        setRestoreError(msg);
        setRestoreStep("error");
        setValidation(null);
        toast.error(msg);
        setTimeout(() => {
          setRestoreStep("idle");
          setRestoreError(null);
        }, 6000);
      }
    });
  }, [validation, isRestoreBusy, startRestoreTransition]);

  const handleCancelRestore = useCallback(() => {
    setValidation(null);
    setRestoreStep("idle");
    setRestoreError(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!isPrincipal) return null;

  return (
    <>
      {/* Confirmation Dialog (portal-style overlay) */}
      {restoreStep === "confirm" && validation && (
        <ConfirmationDialog
          metadata={validation.metadata}
          onConfirm={handleConfirmRestore}
          onCancel={handleCancelRestore}
          isPending={isRestorePending}
        />
      )}

      {/* Restore Progress Dialog */}
      {isRestoreBusy && restoreStep !== "confirm" && (
        <RestoreProgressDialog step={restoreStep} />
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100">
              <DatabaseBackup className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-800">
                Backup & Restore
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Disaster recovery · Principal access only
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Last Backup Info */}
          {lastBackup && !compact && <BackupInfoCard backup={lastBackup} />}

          {/* Action Buttons */}
          <div className={`flex flex-wrap gap-3 ${compact ? "" : "pt-1"}`}>
            {/* Backup Button */}
            <Button
              id="backup-erp-btn"
              onClick={handleBackup}
              disabled={isBackupBusy}
              loading={isBackupBusy}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              {!isBackupBusy && <Download className="h-4 w-4" />}
              {isBackupBusy ? BACKUP_STEP_LABELS[backupStep] : "Backup ERP"}
            </Button>

            {/* Restore Button — triggers file input */}
            <Button
              id="restore-erp-btn"
              variant="outline"
              disabled={isRestoreBusy || restoreStep === "done"}
              onClick={() => fileInputRef.current?.click()}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {isRestoreBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isRestoreBusy
                ? RESTORE_STEP_LABELS[restoreStep]
                : restoreStep === "done"
                ? "Restore Complete"
                : "Restore ERP"}
            </Button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".erpbackup"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Backup progress/status */}
          {backupStep !== "idle" && (
            <ProgressBanner
              label={BACKUP_STEP_LABELS[backupStep]}
              variant={
                backupStep === "done"
                  ? "success"
                  : backupStep === "error"
                  ? "error"
                  : "progress"
              }
            />
          )}

          {/* Restore progress/status */}
          {restoreStep !== "idle" && restoreStep !== "confirm" && (
            <ProgressBanner
              label={
                restoreStep === "error" && restoreError
                  ? restoreError
                  : RESTORE_STEP_LABELS[restoreStep]
              }
              variant={
                restoreStep === "done"
                  ? "success"
                  : restoreStep === "error"
                  ? "error"
                  : "progress"
              }
            />
          )}

          {/* Safety note */}
          {!compact && (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Backups include all school data, students, fees, attendance, results, and settings.
              Restore is transactional — it either succeeds completely or rolls back automatically.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

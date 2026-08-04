"use server";

import { headers } from "next/headers";
import { getBackupProvider } from "@/server/providers/backup.provider";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog, requestMeta } from "@/server/services/audit.service";
import { getCurrentUser } from "@/server/auth/session";

export async function createBackupAction(label?: string) {
  const { user } = await requirePermission("settings.update");

  const provider = getBackupProvider();
  const backup = await provider.createBackup(label);

  // Audit log
  try {
    const hdrs = await headers();
    const meta = requestMeta(hdrs);
    await writeAuditLog({
      schoolId: user.schoolId,
      userId: user.id,
      action: "BACKUP_CREATED",
      module: "BACKUP",
      entityType: "Database",
      entityId: backup.filename,
      newValue: {
        filename: backup.filename,
        sizeBytes: backup.sizeBytes,
        schoolName: backup.schoolName,
        erpVersion: backup.erpVersion,
        sha256: backup.sha256,
        createdAt: backup.createdAt.toISOString(),
      },
      ...meta,
    });
  } catch (auditErr) {
    console.warn("[BackupAction] Audit log write failed (non-fatal):", auditErr);
  }

  return {
    id: backup.id,
    filename: backup.filename,
    sizeBytes: backup.sizeBytes,
    createdAt: backup.createdAt.toISOString(),
    schoolName: backup.schoolName,
    erpVersion: backup.erpVersion,
    backupFormatVersion: backup.backupFormatVersion,
    sha256: backup.sha256,
    ...(backup.label ? { label: backup.label } : {}),
  };
}

export async function listBackupsAction() {
  await requirePermission("settings.view");
  const provider = getBackupProvider();
  const backups = await provider.listBackups();

  // Serialize dates for client transport
  return backups.map((b) => ({
    id: b.id,
    filename: b.filename,
    sizeBytes: b.sizeBytes,
    createdAt: b.createdAt.toISOString(),
    schoolName: b.schoolName,
    erpVersion: b.erpVersion,
    backupFormatVersion: b.backupFormatVersion,
    sha256: b.sha256,
    ...(b.label ? { label: b.label } : {}),
  }));
}

export async function deleteBackupAction(backupIdOrPath: string) {
  await requirePermission("settings.delete");
  const provider = getBackupProvider();
  return provider.deleteBackup(backupIdOrPath);
}

// NOTE: restoreBackupAction is intentionally NOT exposed as a server action.
// Restore is handled via /api/backup/restore and /api/backup/restore/confirm
// Route Handlers because the operation requires file upload (multipart) and
// must never be triggered accidentally via a form submission.
export async function restoreBackupAction(): Promise<never> {
  throw new Error("Use the /api/backup/restore endpoint to restore a backup.");
}

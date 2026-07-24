"use server";

import { getBackupProvider } from "@/server/providers/backup.provider";
import { requirePermission } from "@/server/permissions/guard";

export async function createBackupAction(label?: string) {
  await requirePermission("settings.update");
  const provider = getBackupProvider();
  return provider.createBackup(label);
}

export async function restoreBackupAction(backupIdOrPath: string) {
  await requirePermission("settings.update");
  const provider = getBackupProvider();
  return provider.restoreBackup(backupIdOrPath);
}

export async function listBackupsAction() {
  await requirePermission("settings.view");
  const provider = getBackupProvider();
  return provider.listBackups();
}

export async function deleteBackupAction(backupIdOrPath: string) {
  await requirePermission("settings.delete");
  const provider = getBackupProvider();
  return provider.deleteBackup(backupIdOrPath);
}

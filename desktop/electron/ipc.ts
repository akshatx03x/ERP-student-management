import { ipcMain } from "electron";
import { loadAppConfig } from "../../src/config/app-config";
import { getBackupProvider } from "../../src/server/providers/backup.provider";
import { checkPostgresPort } from "./postgres-manager";

export function registerIpcHandlers(): void {
  // Channel 1: Application Metadata & Configuration
  ipcMain.handle("app:get-config", async () => {
    const config = loadAppConfig();
    return {
      appMode: config.appMode,
      isOffline: config.isOffline,
      uploadProvider: config.uploadProvider,
      backupProvider: config.backupProvider,
      storagePaths: config.offlinePaths,
      version: "1.0.0",
    };
  });

  // Channel 2: Local Infrastructure Status Check
  ipcMain.handle("infra:check-status", async () => {
    const isPgReady = await checkPostgresPort();
    const config = loadAppConfig();
    return {
      postgresReady: isPgReady,
      appMode: config.appMode,
      databaseUrlConfigured: Boolean(config.databaseUrl),
      uploadsDirExists: true,
      timestamp: new Date().toISOString(),
    };
  });

  // Channel 3: Trigger Local Backup
  ipcMain.handle("backup:create", async (_evt: any, payload: { label?: string }) => {
    if (typeof payload?.label !== "undefined" && typeof payload?.label !== "string") {
      throw new Error("Invalid payload: label must be a string");
    }
    const provider = getBackupProvider();
    return provider.createBackup(payload?.label);
  });

  // Channel 4: List Local Backups
  ipcMain.handle("backup:list", async () => {
    const provider = getBackupProvider();
    return provider.listBackups();
  });

  // Channel 5: Restore Local Backup
  ipcMain.handle("backup:restore", async (_evt: any, payload: { backupIdOrPath: string }) => {
    if (!payload?.backupIdOrPath || typeof payload.backupIdOrPath !== "string") {
      throw new Error("Invalid payload: backupIdOrPath is required");
    }
    const provider = getBackupProvider();
    return provider.restoreBackup(payload.backupIdOrPath);
  });

  console.log("[Electron IPC] Secure validated IPC channels registered successfully.");
}

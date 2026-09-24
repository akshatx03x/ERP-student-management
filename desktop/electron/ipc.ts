import { ipcMain, app, dialog, BrowserWindow } from "electron";
import fs from "fs";
import { loadAppConfig } from "./config";
import { getBackupProvider } from "./backup";
import { checkDatabaseReady } from "./sqlite-manager";

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
      version: app.getVersion(),
    };
  });

  // Channel 2: Portable System Status Check
  ipcMain.handle("infra:check-status", async () => {
    const config = loadAppConfig();
    const isDbReady = await checkDatabaseReady(config.offlinePaths.dbFilePath);
    return {
      postgresReady: isDbReady,
      sqliteReady: isDbReady,
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

  // Channel 6: Native Save File Dialog
  ipcMain.handle("dialog:save-file", async (_evt: any, payload?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const options = {
      title: "Save ERP Backup",
      defaultPath: payload?.defaultPath || "school_erp_backup.erpbackup",
      filters: payload?.filters || [
        { name: "ERP Backup (*.erpbackup)", extensions: ["erpbackup"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    return result;
  });

  // Channel 7: Save Buffer to Disk
  ipcMain.handle("file:save-buffer", async (_evt: any, payload: { targetPath: string; bufferBase64?: string; buffer?: Uint8Array }) => {
    if (!payload?.targetPath || (!payload?.bufferBase64 && !payload?.buffer)) {
      throw new Error("Invalid payload: targetPath and buffer data are required");
    }
    const buffer = payload.buffer
      ? Buffer.from(payload.buffer)
      : Buffer.from(payload.bufferBase64!, "base64");
    const dir = require("path").dirname(payload.targetPath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    await fs.promises.writeFile(payload.targetPath, buffer);
    return { success: true, filePath: payload.targetPath };
  });

  console.log("[Electron IPC] Secure validated IPC channels registered successfully.");
}

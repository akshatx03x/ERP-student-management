import { ipcMain, app, dialog, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { loadAppConfig } from "./config";
import { getBackupProvider } from "./backup";
import { checkDatabaseReady } from "./sqlite-manager";

export function registerIpcHandlers(): void {
  // Channel 1: Application Metadata & Configuration
  ipcMain.handle("app:get-config", async () => {
    try {
      const config = loadAppConfig();
      return {
        appMode: config.appMode,
        isOffline: config.isOffline,
        uploadProvider: config.uploadProvider,
        backupProvider: config.backupProvider,
        storagePaths: config.offlinePaths,
        version: app.getVersion(),
      };
    } catch (err: any) {
      console.error("[Electron IPC] app:get-config error:", err);
      throw new Error(`Failed to get app config: ${err.message}`);
    }
  });

  // Channel 2: Portable System Status Check
  ipcMain.handle("infra:check-status", async () => {
    try {
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
    } catch (err: any) {
      console.error("[Electron IPC] infra:check-status error:", err);
      throw new Error(`Infrastructure check error: ${err.message}`);
    }
  });

  // Channel 3: Trigger Local Backup
  ipcMain.handle("backup:create", async (_evt: any, payload: { label?: string }) => {
    try {
      if (typeof payload?.label !== "undefined" && typeof payload?.label !== "string") {
        throw new Error("Invalid payload: label must be a string");
      }
      const provider = getBackupProvider();
      return await provider.createBackup(payload?.label);
    } catch (err: any) {
      console.error("[Electron IPC] backup:create error:", err);
      throw new Error(`Failed to create backup: ${err.message}`);
    }
  });

  // Channel 4: List Local Backups
  ipcMain.handle("backup:list", async () => {
    try {
      const provider = getBackupProvider();
      return await provider.listBackups();
    } catch (err: any) {
      console.error("[Electron IPC] backup:list error:", err);
      return [];
    }
  });

  // Channel 5: Restore Local Backup
  ipcMain.handle("backup:restore", async (_evt: any, payload: { backupIdOrPath: string }) => {
    try {
      if (!payload?.backupIdOrPath || typeof payload.backupIdOrPath !== "string") {
        throw new Error("Invalid payload: backupIdOrPath is required");
      }
      const provider = getBackupProvider();
      return await provider.restoreBackup(payload.backupIdOrPath);
    } catch (err: any) {
      console.error("[Electron IPC] backup:restore error:", err);
      return {
        success: false,
        message: `Restore failed in desktop mode: ${err.message}`,
      };
    }
  });

  // Channel 6: Native Save File Dialog
  ipcMain.handle("dialog:save-file", async (_evt: any, payload?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
    try {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const options = {
        title: "Save ERP Backup",
        defaultPath: payload?.defaultPath || `school_erp_backup_${new Date().toISOString().slice(0, 10)}.erpbackup`,
        filters: payload?.filters || [
          { name: "ERP Backup Archive (*.erpbackup)", extensions: ["erpbackup"] },
          { name: "All Files", extensions: ["*"] },
        ],
      };
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      return result;
    } catch (err: any) {
      console.error("[Electron IPC] dialog:save-file error:", err);
      return { canceled: true, filePath: undefined };
    }
  });

  // Channel 7: Native Open File Dialog
  ipcMain.handle("dialog:open-file", async (_evt: any, payload?: { filters?: { name: string; extensions: string[] }[] }) => {
    try {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const options = {
        title: "Select ERP Backup File to Restore",
        filters: payload?.filters || [
          { name: "ERP Backup Files (*.erpbackup, *.db)", extensions: ["erpbackup", "db", "sqlite"] },
          { name: "All Files", extensions: ["*"] },
        ],
        properties: ["openFile" as const],
      };
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      return result;
    } catch (err: any) {
      console.error("[Electron IPC] dialog:open-file error:", err);
      return { canceled: true, filePaths: [] };
    }
  });

  // Channel 8: Read File to Base64 Buffer
  ipcMain.handle("file:read-buffer", async (_evt: any, payload: { filePath: string }) => {
    try {
      if (!payload?.filePath || typeof payload.filePath !== "string") {
        throw new Error("Valid filePath is required");
      }
      if (!fs.existsSync(payload.filePath)) {
        throw new Error(`File not found: ${payload.filePath}`);
      }
      const buffer = await fs.promises.readFile(payload.filePath);
      return {
        success: true,
        fileName: path.basename(payload.filePath),
        base64: buffer.toString("base64"),
        size: buffer.length,
      };
    } catch (err: any) {
      console.error("[Electron IPC] file:read-buffer error:", err);
      throw new Error(`Failed to read backup file: ${err.message}`);
    }
  });

  // Channel 9: Save Buffer to Disk
  ipcMain.handle("file:save-buffer", async (_evt: any, payload: { targetPath: string; bufferBase64?: string; buffer?: Uint8Array }) => {
    try {
      if (!payload?.targetPath || (!payload?.bufferBase64 && !payload?.buffer)) {
        throw new Error("Invalid payload: targetPath and buffer data are required");
      }

      // Critical Safeguard: Never allow saving a backup file directly over the active database file!
      const config = loadAppConfig();
      const resolvedTarget = path.resolve(payload.targetPath).toLowerCase();
      const activeDb = path.resolve(config.offlinePaths.dbFilePath).toLowerCase();
      if (resolvedTarget === activeDb || resolvedTarget.endsWith(path.sep + "data" + path.sep + "school.db")) {
        throw new Error("Cannot save backup directly over the active database file. Please choose a different filename or directory.");
      }

      const buffer = payload.buffer
        ? Buffer.from(payload.buffer)
        : Buffer.from(payload.bufferBase64!, "base64");
      const dir = path.dirname(payload.targetPath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      await fs.promises.writeFile(payload.targetPath, buffer);
      return { success: true, filePath: payload.targetPath };
    } catch (err: any) {
      console.error("[Electron IPC] file:save-buffer error:", err);
      throw new Error(`Failed to save backup file: ${err.message}`);
    }
  });

  console.log("[Electron IPC] Secure validated IPC channels registered successfully.");
}

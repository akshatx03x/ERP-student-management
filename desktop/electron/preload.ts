import { contextBridge, ipcRenderer } from "electron";

console.log("[Electron Preload] Initializing desktop preload script...");

export interface ElectronAPI {
  getAppConfig: () => Promise<any>;
  checkSystemStatus: () => Promise<any>;
  createBackup: (label?: string) => Promise<any>;
  listBackups: () => Promise<any>;
  restoreBackup: (backupIdOrPath: string) => Promise<any>;
  onSplashProgress: (callback: (data: { status: string; progress: number }) => void) => void;
  showSaveDialog: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath?: string }>;
  saveFile: (options: { targetPath: string; bufferBase64: string }) => Promise<{ success: boolean; filePath: string }>;
}

const api: ElectronAPI = {
  getAppConfig: () => ipcRenderer.invoke("app:get-config"),
  checkSystemStatus: () => ipcRenderer.invoke("infra:check-status"),
  createBackup: (label?: string) => ipcRenderer.invoke("backup:create", { label }),
  listBackups: () => ipcRenderer.invoke("backup:list"),
  restoreBackup: (backupIdOrPath: string) => ipcRenderer.invoke("backup:restore", { backupIdOrPath }),
  onSplashProgress: (callback: (data: { status: string; progress: number }) => void) => {
    ipcRenderer.on("splash:progress", (_, data) => callback(data));
  },
  showSaveDialog: (options) => ipcRenderer.invoke("dialog:save-file", options),
  saveFile: (options) => ipcRenderer.invoke("file:save-buffer", options),
};

try {
  contextBridge.exposeInMainWorld("electronAPI", api);
  console.log("[Electron Preload] electronAPI exposed in main world successfully.");
} catch (err) {
  console.error("[Electron Preload] Failed to expose electronAPI in main world:", err);
}

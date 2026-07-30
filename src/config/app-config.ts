import path from "path";

export type AppMode = "offline";

export interface AppConfig {
  appMode: AppMode;
  isOffline: boolean;
  isCloud: boolean;
  databaseUrl: string;
  uploadProvider: "filesystem";
  backupProvider: "local_sqlite";
  storageProvider: "filesystem";
  offlinePaths: {
    baseDir: string;
    dataDir: string;
    dbFilePath: string;
    uploadsDir: string;
    backupsDir: string;
    storageDir: string;
    logsDir: string;
    tempDir: string;
  };
  serverPort: number;
}

function getBaseDataDirectory(): string {
  if (process.env.OFFLINE_DATA_DIR && process.env.OFFLINE_DATA_DIR.trim() !== "") {
    return process.env.OFFLINE_DATA_DIR.trim();
  }
  if (typeof process !== "undefined" && process.versions && process.versions.electron) {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-require-imports */
      const { app } = require("electron");
      if (app && app.isPackaged) {
        return path.dirname(process.execPath);
      }
    } catch {}
  }
  return process.cwd();
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL.trim();
  }
  const baseDir = getBaseDataDirectory();
  const dbPath = path.join(baseDir, "data", "school.db");
  return `file:${dbPath}`;
}

export const appConfig: AppConfig = {
  get appMode(): AppMode {
    return "offline";
  },
  get isOffline(): boolean {
    return true;
  },
  get isCloud(): boolean {
    return false;
  },
  get databaseUrl(): string {
    return resolveDatabaseUrl();
  },
  get uploadProvider(): "filesystem" {
    return "filesystem";
  },
  get backupProvider(): "local_sqlite" {
    return "local_sqlite";
  },
  get storageProvider(): "filesystem" {
    return "filesystem";
  },
  get offlinePaths() {
    const baseDir = getBaseDataDirectory();
    return {
      baseDir,
      dataDir: path.join(baseDir, "data"),
      dbFilePath: path.join(baseDir, "data", "school.db"),
      uploadsDir: process.env.OFFLINE_UPLOAD_DIR || path.join(baseDir, "uploads"),
      backupsDir: process.env.OFFLINE_BACKUP_DIR || path.join(baseDir, "backups"),
      storageDir: process.env.OFFLINE_STORAGE_DIR || path.join(baseDir, "storage"),
      logsDir: process.env.OFFLINE_LOG_DIR || path.join(baseDir, "logs"),
      tempDir: process.env.OFFLINE_TEMP_DIR || path.join(baseDir, "temp"),
    };
  },
  get serverPort() {
    return parseInt(process.env.PORT || "3000", 10);
  },
};

export function loadAppConfig(): AppConfig {
  return appConfig;
}

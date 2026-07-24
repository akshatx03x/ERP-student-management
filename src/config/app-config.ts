import path from "path";

export type AppMode = "cloud" | "offline";

export interface AppConfig {
  appMode: AppMode;
  isOffline: boolean;
  isCloud: boolean;
  databaseUrl: string;
  uploadProvider: "database" | "filesystem";
  backupProvider: "cloud_stub" | "local_postgres";
  storageProvider: "database" | "filesystem";
  offlinePaths: {
    baseDir: string;
    uploadsDir: string;
    backupsDir: string;
    storageDir: string;
  };
  serverPort: number;
}

function resolveAppMode(): AppMode {
  const mode = process.env.APP_MODE?.toLowerCase().trim();
  if (mode === "offline" || mode === "desktop") {
    return "offline";
  }
  return "cloud";
}

function resolveDatabaseUrl(mode: AppMode): string {
  if (mode === "offline") {
    const localUrl = process.env.DATABASE_URL_LOCAL;
    if (localUrl && localUrl.trim() !== "") {
      return localUrl.trim();
    }
    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("supabase.com")) {
      return process.env.DATABASE_URL.trim();
    }
    return "postgresql://postgres:postgres@localhost:5432/school_erp_offline";
  }

  const cloudUrl = process.env.DATABASE_URL_CLOUD || process.env.DATABASE_URL;
  if (cloudUrl && cloudUrl.trim() !== "") {
    return cloudUrl.trim();
  }

  return process.env.DATABASE_URL || "";
}

function getBaseDataDirectory(): string {
  if (process.env.OFFLINE_DATA_DIR) {
    return process.env.OFFLINE_DATA_DIR;
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
    if (appData) {
      return path.join(appData, "SchoolERP");
    }
    const programData = process.env.ProgramData || "C:\\ProgramData";
    return path.join(programData, "SchoolERP");
  }
  return path.join(process.cwd(), ".data");
}

export const appConfig: AppConfig = {
  get appMode() {
    return resolveAppMode();
  },
  get isOffline() {
    return resolveAppMode() === "offline";
  },
  get isCloud() {
    return resolveAppMode() === "cloud";
  },
  get databaseUrl() {
    return resolveDatabaseUrl(resolveAppMode());
  },
  get uploadProvider() {
    return resolveAppMode() === "offline" ? "filesystem" : "database";
  },
  get backupProvider() {
    return resolveAppMode() === "offline" ? "local_postgres" : "cloud_stub";
  },
  get storageProvider() {
    return resolveAppMode() === "offline" ? "filesystem" : "database";
  },
  get offlinePaths() {
    const baseDir = getBaseDataDirectory();
    return {
      baseDir,
      uploadsDir: process.env.OFFLINE_UPLOAD_DIR || path.join(baseDir, "uploads"),
      backupsDir: process.env.OFFLINE_BACKUP_DIR || path.join(baseDir, "backups"),
      storageDir: process.env.OFFLINE_STORAGE_DIR || path.join(baseDir, "storage"),
    };
  },
  get serverPort() {
    return parseInt(process.env.PORT || "3000", 10);
  },
};

export function loadAppConfig(): AppConfig {
  return appConfig;
}

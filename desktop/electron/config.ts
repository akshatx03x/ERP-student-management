import path from "path";
import { ensureWritableDirectoriesExist } from "./paths";

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

export function loadAppConfig(): AppConfig {
  const paths = ensureWritableDirectoriesExist();
  const dbFilePath = paths.dbFilePath;
  const databaseUrl = `file:${dbFilePath}`;
  
  return {
    appMode: "offline" as const,
    isOffline: true,
    isCloud: false,
    databaseUrl,
    uploadProvider: "filesystem" as const,
    backupProvider: "local_sqlite" as const,
    storageProvider: "filesystem" as const,
    offlinePaths: {
      baseDir: paths.baseDataDir,
      dataDir: paths.dataDir,
      dbFilePath: paths.dbFilePath,
      uploadsDir: paths.uploadsDir,
      backupsDir: paths.backupsDir,
      storageDir: paths.storageDir,
      logsDir: paths.logsDir,
      tempDir: paths.tempDir,
    },
    serverPort: Number(process.env.PORT ?? 3000),
  };
}

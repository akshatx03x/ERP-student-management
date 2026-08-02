import fs from "fs";
import path from "path";
import { loadAppConfig } from "./config";
import { prisma, ensureSqlitePragmas } from "./prisma";

export interface BackupMetadata {
  id: string;
  filename: string;
  filePath: string;
  sizeBytes: number;
  createdAt: Date;
  mode: "offline";
}

export interface IBackupProvider {
  createBackup(label?: string): Promise<BackupMetadata>;
  restoreBackup(backupIdOrPath: string): Promise<{ success: boolean; message: string }>;
  listBackups(): Promise<BackupMetadata[]>;
  deleteBackup(backupIdOrPath: string): Promise<boolean>;
}

export class LocalSqliteBackupProvider implements IBackupProvider {
  private backupsDir: string;

  constructor(backupsDir?: string) {
    const config = loadAppConfig();
    this.backupsDir = backupsDir || config.offlinePaths.backupsDir;
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  async createBackup(label?: string): Promise<BackupMetadata> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitizedLabel = label ? `_${label.replace(/[^a-zA-Z0-9_]/g, "")}` : "";
    const filename = `school_erp_backup_${timestamp}${sanitizedLabel}.db`;
    const filePath = path.join(this.backupsDir, filename);
    const normalizedPath = filePath.replace(/\\/g, "/");

    const config = loadAppConfig();

    try {
      await ensureSqlitePragmas(prisma);
      await prisma.$executeRawUnsafe(`VACUUM INTO '${normalizedPath}';`);
      console.log(`[LocalSqliteBackupProvider] Atomic VACUUM INTO backup created successfully at: ${filePath}`);
    } catch (err: any) {
      console.warn(`[LocalSqliteBackupProvider] VACUUM INTO statement warning: ${err.message}. Performing direct file copy fallback...`);
      const targetDbFile = config.offlinePaths.dbFilePath;
      if (fs.existsSync(targetDbFile)) {
        await fs.promises.copyFile(targetDbFile, filePath);
      } else {
        throw new Error(`Database file not found for backup at: ${targetDbFile}`);
      }
    }

    const stats = await fs.promises.stat(filePath);

    return {
      id: filename,
      filename,
      filePath,
      sizeBytes: stats.size,
      createdAt: stats.birthtime || new Date(),
      mode: "offline",
    };
  }

  async restoreBackup(backupIdOrPath: string): Promise<{ success: boolean; message: string }> {
    let backupPath = backupIdOrPath;
    if (!path.isAbsolute(backupPath)) {
      backupPath = path.join(this.backupsDir, backupIdOrPath);
    }

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found at: ${backupPath}`);
    }

    const config = loadAppConfig();
    const targetDbFile = config.offlinePaths.dbFilePath;
    const walFile = `${targetDbFile}-wal`;
    const shmFile = `${targetDbFile}-shm`;

    try {
      await prisma.$disconnect();

      if (fs.existsSync(walFile)) {
        try { await fs.promises.unlink(walFile); } catch {}
      }
      if (fs.existsSync(shmFile)) {
        try { await fs.promises.unlink(shmFile); } catch {}
      }

      await fs.promises.copyFile(backupPath, targetDbFile);

      await prisma.$connect();
      await ensureSqlitePragmas(prisma);

      return {
        success: true,
        message: `Successfully restored database from backup: ${path.basename(backupPath)}`,
      };
    } catch (err: any) {
      try {
        await prisma.$connect();
      } catch {}
      return {
        success: false,
        message: `Failed to restore SQLite database: ${err.message}`,
      };
    }
  }

  async listBackups(): Promise<BackupMetadata[]> {
    if (!fs.existsSync(this.backupsDir)) {
      return [];
    }

    const files = await fs.promises.readdir(this.backupsDir);
    const backups: BackupMetadata[] = [];

    for (const file of files) {
      if (file.endsWith(".db") || file.endsWith(".sqlite") || file.endsWith(".sql")) {
        const filePath = path.join(this.backupsDir, file);
        const stats = await fs.promises.stat(filePath);
        backups.push({
          id: file,
          filename: file,
          filePath,
          sizeBytes: stats.size,
          createdAt: stats.mtime || stats.birthtime,
          mode: "offline",
        });
      }
    }

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async deleteBackup(backupIdOrPath: string): Promise<boolean> {
    let filePath = backupIdOrPath;
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(this.backupsDir, backupIdOrPath);
    }
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  }
}

let backupProviderInstance: IBackupProvider | null = null;

export function getBackupProvider(): IBackupProvider {
  if (!backupProviderInstance) {
    backupProviderInstance = new LocalSqliteBackupProvider();
  }
  return backupProviderInstance;
}

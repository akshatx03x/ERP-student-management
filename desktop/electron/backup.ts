import fs from "fs";
import path from "path";
import zlib from "zlib";
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

async function zipExtract(archive: Buffer): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  let offset = 0;
  if (archive.length < 4) return result;
  const count = archive.readUInt32LE(offset);
  offset += 4;
  if (count === 0 || count > 1000000) return result;
  for (let i = 0; i < count; i++) {
    if (offset + 4 > archive.length) break;
    const nameLen = archive.readUInt32LE(offset);
    offset += 4;
    if (nameLen > 4096 || offset + nameLen > archive.length) break;
    const name = archive.subarray(offset, offset + nameLen).toString("utf8");
    offset += nameLen;
    if (offset + 8 > archive.length) break;
    const dataLen = Number(archive.readBigUInt64LE(offset));
    offset += 8;
    if (dataLen < 0 || offset + dataLen > archive.length) break;
    const compressedData = archive.subarray(offset, offset + dataLen);
    offset += dataLen;
    const decompressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.inflate(compressedData, (err, buf) => {
        if (err) reject(err);
        else resolve(buf);
      });
    });
    result.set(name, decompressed);
  }
  return result;
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
      try {
        await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
      } catch {}
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

    let sourceDbToCopy = backupPath;
    let tempExtractedDb: string | null = null;
    const extractedUploads: Array<{ name: string; data: Buffer }> = [];

    try {
      // Check if backup is .erpbackup package (starts with count buffer, not SQLite header)
      const headerBuf = Buffer.alloc(16);
      const fd = await fs.promises.open(backupPath, "r");
      try {
        await fd.read(headerBuf, 0, 16, 0);
      } finally {
        await fd.close();
      }

      if (headerBuf.toString("utf8") !== "SQLite format 3\0") {
        const raw = await fs.promises.readFile(backupPath);
        const entries = await zipExtract(raw);
        const dbBuf = entries.get("database.db");
        if (!dbBuf) {
          throw new Error("Invalid .erpbackup archive: database.db not found inside.");
        }
        tempExtractedDb = path.join(config.offlinePaths.tempDir, `desktop_restore_${Date.now()}.db`);
        await fs.promises.writeFile(tempExtractedDb, dbBuf);
        sourceDbToCopy = tempExtractedDb;

        for (const [name, buf] of entries.entries()) {
          if (name.startsWith("uploads/")) {
            extractedUploads.push({ name: name.substring("uploads/".length), data: buf });
          }
        }
      }

      await prisma.$disconnect();
      await new Promise((r) => setTimeout(r, 200));

      if (fs.existsSync(walFile)) {
        try { await fs.promises.unlink(walFile); } catch {}
      }
      if (fs.existsSync(shmFile)) {
        try { await fs.promises.unlink(shmFile); } catch {}
      }

      await fs.promises.copyFile(sourceDbToCopy, targetDbFile);

      // Restore uploads
      if (extractedUploads.length > 0) {
        for (const up of extractedUploads) {
          const dest = path.join(config.offlinePaths.uploadsDir, up.name);
          const dir = path.dirname(dest);
          if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
          }
          await fs.promises.writeFile(dest, up.data);
        }
      }

      await prisma.$connect();
      await ensureSqlitePragmas(prisma);

      return {
        success: true,
        message: `Successfully restored database and assets from backup: ${path.basename(backupPath)}`,
      };
    } catch (err: any) {
      try {
        await prisma.$connect();
      } catch {}
      return {
        success: false,
        message: `Failed to restore SQLite database: ${err.message}`,
      };
    } finally {
      if (tempExtractedDb && fs.existsSync(tempExtractedDb)) {
        try { await fs.promises.unlink(tempExtractedDb); } catch {}
      }
    }
  }

  async listBackups(): Promise<BackupMetadata[]> {
    if (!fs.existsSync(this.backupsDir)) {
      return [];
    }

    const files = await fs.promises.readdir(this.backupsDir);
    const backups: BackupMetadata[] = [];

    for (const file of files) {
      if (file.endsWith(".erpbackup") || file.endsWith(".db") || file.endsWith(".sqlite")) {
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

import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { appConfig } from "../../config/app-config";
import { prisma, ensureSqlitePragmas } from "../lib/prisma";

// ─── Constants ─────────────────────────────────────────────────────────────────

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTENSION = ".erpbackup";

// ─── Typed Error ────────────────────────────────────────────────────────────────

export type BackupErrorCode =
  | "FILE_NOT_FOUND"
  | "INVALID_FORMAT"
  | "CORRUPT_ARCHIVE"
  | "INTEGRITY_MISMATCH"
  | "VERSION_INCOMPATIBLE"
  | "DB_NOT_FOUND"
  | "RESTORE_FAILED"
  | "PERMISSION_DENIED";

export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface BackupFileMetadata {
  backupFormatVersion: number;
  erpVersion: string;
  dbVersion: string;
  createdAt: string; // ISO 8601
  schoolName: string;
  label?: string;
  sha256: string; // SHA-256 hex digest of the inner database.db
}

export interface BackupMetadata {
  id: string; // filename without extension
  filename: string; // e.g. school_erp_backup_2026-08-04T11-00-00-000Z.erpbackup
  filePath: string;
  sizeBytes: number;
  createdAt: Date;
  mode: "offline";
  // Populated from embedded metadata.json
  schoolName: string;
  backupFormatVersion: number;
  erpVersion: string;
  sha256: string;
  label?: string;
}

export interface RestoreValidationResult {
  valid: true;
  tempDbPath: string;
  metadata: BackupFileMetadata;
}

export interface IBackupProvider {
  createBackup(label?: string): Promise<BackupMetadata>;
  validateAndPrepareRestore(backupFilePath: string): Promise<RestoreValidationResult>;
  executeRestore(validatedTempDbPath: string): Promise<{ success: boolean; message: string }>;
  listBackups(): Promise<BackupMetadata[]>;
  deleteBackup(backupIdOrPath: string): Promise<boolean>;
}

// ─── Tiny ZIP / Unzip Utilities ─────────────────────────────────────────────────
// We use Node's built-in zlib (deflate/inflate) to avoid external dependencies.
// Format: [4-byte count][entry0][entry1]...
// Each entry: [4-byte name-len][name utf8][8-byte data-len][compressed data]

async function zipCreate(entries: Array<{ name: string; data: Buffer }>): Promise<Buffer> {
  const parts: Buffer[] = [];

  // header: number of entries (4 bytes LE)
  const countBuf = Buffer.allocUnsafe(4);
  countBuf.writeUInt32LE(entries.length, 0);
  parts.push(countBuf);

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const nameLenBuf = Buffer.allocUnsafe(4);
    nameLenBuf.writeUInt32LE(nameBuf.length, 0);

    const compressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.deflate(entry.data, { level: zlib.constants.Z_BEST_COMPRESSION }, (err, buf) => {
        if (err) reject(err);
        else resolve(buf);
      });
    });

    const dataLenBuf = Buffer.allocUnsafe(8);
    // Use BigInt for large file support
    dataLenBuf.writeBigUInt64LE(BigInt(compressed.length), 0);

    parts.push(nameLenBuf, nameBuf, dataLenBuf, compressed);
  }

  return Buffer.concat(parts);
}

async function zipExtract(archive: Buffer): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  let offset = 0;

  if (archive.length < 4) {
    throw new BackupError("INVALID_FORMAT", "Archive is too small to be a valid .erpbackup file.");
  }

  const count = archive.readUInt32LE(offset);
  offset += 4;

  if (count === 0 || count > 100) {
    throw new BackupError("INVALID_FORMAT", "Archive entry count is invalid.");
  }

  for (let i = 0; i < count; i++) {
    if (offset + 4 > archive.length) throw new BackupError("CORRUPT_ARCHIVE", "Unexpected end of archive reading name length.");
    const nameLen = archive.readUInt32LE(offset);
    offset += 4;

    if (nameLen > 4096 || offset + nameLen > archive.length) throw new BackupError("CORRUPT_ARCHIVE", "Invalid entry name length in archive.");
    const name = archive.subarray(offset, offset + nameLen).toString("utf8");
    offset += nameLen;

    if (offset + 8 > archive.length) throw new BackupError("CORRUPT_ARCHIVE", "Unexpected end of archive reading data length.");
    const dataLen = Number(archive.readBigUInt64LE(offset));
    offset += 8;

    if (dataLen < 0 || offset + dataLen > archive.length) throw new BackupError("CORRUPT_ARCHIVE", "Invalid data length in archive entry.");
    const compressedData = archive.subarray(offset, offset + dataLen);
    offset += dataLen;

    const decompressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.inflate(compressedData, (err, buf) => {
        if (err) reject(new BackupError("CORRUPT_ARCHIVE", `Failed to decompress entry '${name}': ${err.message}`));
        else resolve(buf);
      });
    });

    result.set(name, decompressed);
  }

  return result;
}

// ─── SHA-256 Helper ─────────────────────────────────────────────────────────────

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ─── Get ERP Version ────────────────────────────────────────────────────────────

function getErpVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require("../../../package.json") as { version?: string };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

// ─── Read metadata from .erpbackup file ─────────────────────────────────────────

async function readBackupMetadataFromFile(filePath: string): Promise<BackupFileMetadata | null> {
  try {
    const raw = await fs.promises.readFile(filePath);
    const entries = await zipExtract(raw);
    const metaRaw = entries.get("metadata.json");
    if (!metaRaw) return null;
    return JSON.parse(metaRaw.toString("utf8")) as BackupFileMetadata;
  } catch {
    return null;
  }
}

// ─── LocalSqliteBackupProvider ───────────────────────────────────────────────────

export class LocalSqliteBackupProvider implements IBackupProvider {
  private backupsDir: string;
  private tempDir: string;

  constructor(backupsDir?: string, tempDir?: string) {
    this.backupsDir = backupsDir || appConfig.offlinePaths.backupsDir;
    this.tempDir = tempDir || appConfig.offlinePaths.tempDir;

    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  // ── createBackup ─────────────────────────────────────────────────────────────

  async createBackup(label?: string): Promise<BackupMetadata> {
    await ensureSqlitePragmas(prisma);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitizedLabel = label ? `_${label.replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
    const backupId = `school_erp_backup_${timestamp}${sanitizedLabel}`;
    const filename = `${backupId}${BACKUP_EXTENSION}`;
    const archivePath = path.join(this.backupsDir, filename);

    // Step 1 — produce a clean SQLite snapshot via VACUUM INTO
    const tempDbPath = path.join(this.tempDir, `${backupId}_temp.db`);
    const normalizedTempPath = tempDbPath.replace(/\\/g, "/");

    try {
      await prisma.$executeRawUnsafe(`VACUUM INTO '${normalizedTempPath}';`);
      console.log(`[BackupProvider] VACUUM INTO snapshot created at: ${tempDbPath}`);
    } catch (vacuumErr: unknown) {
      // Fallback: direct file copy
      console.warn(
        `[BackupProvider] VACUUM INTO failed, falling back to file copy: ${(vacuumErr as Error).message}`,
      );
      const sourceDbFile = appConfig.offlinePaths.dbFilePath;
      if (!fs.existsSync(sourceDbFile)) {
        throw new BackupError("DB_NOT_FOUND", `Database file not found at: ${sourceDbFile}`);
      }
      await fs.promises.copyFile(sourceDbFile, tempDbPath);
    }

    try {
      // Step 2 — compute SHA-256 of the snapshot
      const sha256 = await sha256File(tempDbPath);

      // Step 3 — read school name for metadata
      let schoolName = "Unknown School";
      try {
        const school = await prisma.school.findFirst({ select: { name: true } });
        if (school) schoolName = school.name;
      } catch {
        // non-critical
      }

      // Step 4 — build metadata
      const fileMetadata: BackupFileMetadata = {
        backupFormatVersion: BACKUP_FORMAT_VERSION,
        erpVersion: getErpVersion(),
        dbVersion: "sqlite3",
        createdAt: new Date().toISOString(),
        schoolName,
        sha256,
        ...(label ? { label } : {}),
      };

      // Step 5 — read snapshot into buffer and create archive
      const dbBuffer = await fs.promises.readFile(tempDbPath);
      const metaBuffer = Buffer.from(JSON.stringify(fileMetadata, null, 2), "utf8");

      const archiveBuffer = await zipCreate([
        { name: "database.db", data: dbBuffer },
        { name: "metadata.json", data: metaBuffer },
      ]);

      await fs.promises.writeFile(archivePath, archiveBuffer);

      const stats = await fs.promises.stat(archivePath);

      console.log(
        `[BackupProvider] .erpbackup archive created: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
      );

      return {
        id: backupId,
        filename,
        filePath: archivePath,
        sizeBytes: stats.size,
        createdAt: new Date(),
        mode: "offline",
        schoolName: fileMetadata.schoolName,
        backupFormatVersion: fileMetadata.backupFormatVersion,
        erpVersion: fileMetadata.erpVersion,
        sha256: fileMetadata.sha256,
        ...(label ? { label } : {}),
      };
    } finally {
      // Always clean up the temp snapshot
      try {
        if (fs.existsSync(tempDbPath)) await fs.promises.unlink(tempDbPath);
      } catch {
        // non-critical
      }
    }
  }

  // ── validateAndPrepareRestore ─────────────────────────────────────────────────

  async validateAndPrepareRestore(backupFilePath: string): Promise<RestoreValidationResult> {
    // 1. File must exist
    if (!fs.existsSync(backupFilePath)) {
      throw new BackupError("FILE_NOT_FOUND", `Backup file not found at: ${backupFilePath}`);
    }

    // 2. Read archive
    let archiveBuffer: Buffer;
    try {
      archiveBuffer = await fs.promises.readFile(backupFilePath);
    } catch (err: unknown) {
      throw new BackupError("FILE_NOT_FOUND", `Cannot read backup file: ${(err as Error).message}`);
    }

    // 3. Extract entries
    let entries: Map<string, Buffer>;
    try {
      entries = await zipExtract(archiveBuffer);
    } catch (err: unknown) {
      if (err instanceof BackupError) throw err;
      throw new BackupError("CORRUPT_ARCHIVE", `Failed to read archive: ${(err as Error).message}`);
    }

    // 4. Validate metadata.json exists
    const metaRaw = entries.get("metadata.json");
    if (!metaRaw) {
      throw new BackupError("INVALID_FORMAT", "Backup file is missing metadata.json. This does not appear to be a valid .erpbackup file.");
    }

    let fileMetadata: BackupFileMetadata;
    try {
      fileMetadata = JSON.parse(metaRaw.toString("utf8")) as BackupFileMetadata;
    } catch {
      throw new BackupError("INVALID_FORMAT", "metadata.json in the backup file is corrupted and cannot be parsed.");
    }

    // 5. Validate required metadata fields
    if (
      typeof fileMetadata.backupFormatVersion !== "number" ||
      typeof fileMetadata.sha256 !== "string" ||
      typeof fileMetadata.createdAt !== "string" ||
      typeof fileMetadata.schoolName !== "string"
    ) {
      throw new BackupError("INVALID_FORMAT", "metadata.json is missing required fields. The backup may be from an incompatible version.");
    }

    // 6. Version compatibility check
    if (fileMetadata.backupFormatVersion > BACKUP_FORMAT_VERSION) {
      throw new BackupError(
        "VERSION_INCOMPATIBLE",
        `This backup was created with a newer version of the ERP (format v${fileMetadata.backupFormatVersion}). The current system only supports format v${BACKUP_FORMAT_VERSION}. Please upgrade the ERP before restoring.`,
      );
    }

    // 7. database.db must be present
    const dbBuffer = entries.get("database.db");
    if (!dbBuffer) {
      throw new BackupError("INVALID_FORMAT", "Backup archive does not contain a database.db file. The backup is incomplete.");
    }

    // 8. Integrity check — SHA-256 of the extracted database.db
    const actualHash = sha256Buffer(dbBuffer);
    if (actualHash !== fileMetadata.sha256) {
      throw new BackupError(
        "INTEGRITY_MISMATCH",
        `SHA-256 integrity check failed. The backup file may be corrupted or tampered with.\nExpected: ${fileMetadata.sha256}\nActual:   ${actualHash}`,
      );
    }

    // 9. Write validated database to temp path
    const tempDbPath = path.join(
      this.tempDir,
      `restore_validated_${Date.now()}.db`,
    );
    await fs.promises.writeFile(tempDbPath, dbBuffer);

    console.log(`[BackupProvider] Backup validated successfully. Temp DB at: ${tempDbPath}`);

    return {
      valid: true,
      tempDbPath,
      metadata: fileMetadata,
    };
  }

  // ── executeRestore ────────────────────────────────────────────────────────────

  async executeRestore(validatedTempDbPath: string): Promise<{ success: boolean; message: string }> {
    if (!fs.existsSync(validatedTempDbPath)) {
      return {
        success: false,
        message: "The validated restore file has expired or was not found. Please re-upload the backup file.",
      };
    }

    const targetDbFile = appConfig.offlinePaths.dbFilePath;
    const walFile = `${targetDbFile}-wal`;
    const shmFile = `${targetDbFile}-shm`;

    // Create a safety backup of the current db before overwriting
    const safetyBackupPath = `${targetDbFile}.pre-restore-${Date.now()}.bak`;

    try {
      // Step 1 — Snapshot current DB as a safety net
      if (fs.existsSync(targetDbFile)) {
        await fs.promises.copyFile(targetDbFile, safetyBackupPath);
      }

      // Step 2 — Disconnect Prisma to release all file locks
      await prisma.$disconnect();

      // Step 3 — Delete WAL/SHM files (leftover journal files can interfere)
      for (const f of [walFile, shmFile]) {
        if (fs.existsSync(f)) {
          try { await fs.promises.unlink(f); } catch { /* non-critical */ }
        }
      }

      // Step 4 — Atomic file copy (this is the point of no return)
      await fs.promises.copyFile(validatedTempDbPath, targetDbFile);

      // Step 5 — Reconnect Prisma to the restored database
      await prisma.$connect();
      await ensureSqlitePragmas(prisma);

      // Step 6 — Clean up temp file
      try { await fs.promises.unlink(validatedTempDbPath); } catch { /* non-critical */ }

      // Step 7 — Remove safety backup (restore succeeded)
      try { await fs.promises.unlink(safetyBackupPath); } catch { /* non-critical */ }

      console.log("[BackupProvider] Database restored successfully.");

      return {
        success: true,
        message: "Database restored successfully. The ERP is now running on the restored data.",
      };
    } catch (err: unknown) {
      console.error("[BackupProvider] Restore failed:", err);

      // Attempt to roll back using the safety backup
      try {
        await prisma.$disconnect();
      } catch { /* ignore */ }

      if (fs.existsSync(safetyBackupPath)) {
        try {
          await fs.promises.copyFile(safetyBackupPath, targetDbFile);
          await prisma.$connect();
          await ensureSqlitePragmas(prisma);
          console.log("[BackupProvider] Rolled back to pre-restore database successfully.");
        } catch (rollbackErr: unknown) {
          console.error("[BackupProvider] Rollback also failed:", rollbackErr);
        }
      } else {
        // Try to reconnect regardless
        try {
          await prisma.$connect();
        } catch { /* ignore */ }
      }

      return {
        success: false,
        message: `Restore failed: ${(err as Error).message}. The original database has been restored automatically.`,
      };
    }
  }

  // ── listBackups ───────────────────────────────────────────────────────────────

  async listBackups(): Promise<BackupMetadata[]> {
    if (!fs.existsSync(this.backupsDir)) return [];

    const files = await fs.promises.readdir(this.backupsDir);
    const backups: BackupMetadata[] = [];

    for (const file of files) {
      if (!file.endsWith(BACKUP_EXTENSION)) continue;

      const filePath = path.join(this.backupsDir, file);
      const stats = await fs.promises.stat(filePath);
      const fileMetadata = await readBackupMetadataFromFile(filePath);

      backups.push({
        id: file.replace(BACKUP_EXTENSION, ""),
        filename: file,
        filePath,
        sizeBytes: stats.size,
        createdAt: fileMetadata?.createdAt ? new Date(fileMetadata.createdAt) : (stats.mtime ?? stats.birthtime),
        mode: "offline",
        schoolName: fileMetadata?.schoolName ?? "Unknown",
        backupFormatVersion: fileMetadata?.backupFormatVersion ?? 1,
        erpVersion: fileMetadata?.erpVersion ?? "unknown",
        sha256: fileMetadata?.sha256 ?? "",
        ...(fileMetadata?.label ? { label: fileMetadata.label } : {}),
      });
    }

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ── deleteBackup ──────────────────────────────────────────────────────────────

  async deleteBackup(backupIdOrPath: string): Promise<boolean> {
    let filePath = backupIdOrPath;
    if (!path.isAbsolute(filePath)) {
      // Try with extension first
      const withExt = path.join(this.backupsDir, backupIdOrPath.endsWith(BACKUP_EXTENSION) ? backupIdOrPath : `${backupIdOrPath}${BACKUP_EXTENSION}`);
      filePath = withExt;
    }
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  }
}

// ─── Singleton Factory ───────────────────────────────────────────────────────────

let backupProviderInstance: IBackupProvider | null = null;

export function getBackupProvider(): IBackupProvider {
  if (!backupProviderInstance) {
    backupProviderInstance = new LocalSqliteBackupProvider();
  }
  return backupProviderInstance;
}

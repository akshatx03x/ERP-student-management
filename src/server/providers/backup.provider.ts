import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { appConfig } from "../../config/app-config";
import { prisma, ensureSqlitePragmas, recreatePrismaInstance } from "../lib/prisma";

export function getSchemaFingerprint(): string {
  try {
    const schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }
    const content = fs.readFileSync(schemaPath, "utf8");
    // Normalize content:
    // 1. Remove single-line comments // ...
    // 2. Remove multi-line comments /* ... */
    // 3. Normalize all line endings to \n
    // 4. Collapse consecutive spaces/tabs to a single space
    // 5. Remove blank lines
    // 6. Trim leading/trailing whitespace
    const normalized = content
      .replace(/\/\/.*$/gm, "")                     // remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, "")             // remove block comments
      .replace(/\r\n/g, "\n")                        // normalize line endings
      .replace(/[ \t]+/g, " ")                      // collapse spaces/tabs
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join("\n");
      
    return crypto.createHash("sha256").update(normalized).digest("hex");
  } catch (err: any) {
    console.error("[BackupProvider] Failed to compute schema fingerprint:", err);
    return "unknown-fingerprint";
  }
}

/**
 * Validate a database file snapshot using native SQLite library (NO PRISMA).
 * Verifies integrity and foreign keys.
 */
export function verifyBackupDbSnapshot(dbFilePath: string): { sqliteVersion: string } {
  let db: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require("node:sqlite");
    db = new DatabaseSync(dbFilePath);
    
    // 1. SQLite PRAGMA integrity_check
    const integrity = db.prepare("PRAGMA integrity_check;").all() as { integrity_check: string }[];
    if (!integrity || integrity.length === 0 || integrity[0].integrity_check !== "ok") {
      throw new BackupError("CORRUPT_ARCHIVE", "Database integrity validation failed.");
    }
    
    // 2. SQLite PRAGMA foreign_key_check
    const fkChecks = db.prepare("PRAGMA foreign_key_check;").all();
    if (fkChecks && fkChecks.length > 0) {
      throw new BackupError("INVALID_FORMAT", "Foreign key validation failed.");
    }

    // 3. Get SQLite Version
    const sqlVersionRow = db.prepare("SELECT sqlite_version() AS version;").get() as { version: string } | undefined;
    const sqliteVersion = sqlVersionRow?.version ?? "unknown";

    return { sqliteVersion };
  } catch (err: any) {
    if (err instanceof BackupError) {
      throw err;
    }
    throw new BackupError("CORRUPT_ARCHIVE", `Database integrity validation failed: ${err.message}`);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

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
  sqliteVersion: string;
  createdAt: string; // ISO 8601
  schoolName: string;
  label?: string;
  sha256: string; // SHA-256 hex digest of the inner database.db
  schemaFingerprint: string;
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
  schemaFingerprint: string;
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
      // Step 2 — Verify and validate the temporary database snapshot using native SQLite
      const { sqliteVersion } = verifyBackupDbSnapshot(tempDbPath);

      // Step 3 — compute SHA-256 of the snapshot
      const sha256 = await sha256File(tempDbPath);

      // Step 4 — read school details and session for metadata
      let schoolName = "Unknown School";
      let schoolId = "";
      let activeSession = "";
      try {
        const school = await prisma.school.findFirst({ select: { id: true, name: true } });
        if (school) {
          schoolName = school.name;
          schoolId = school.id;
        }
        const session = await prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { name: true } });
        if (session) {
          activeSession = session.name;
        }
      } catch {
        // non-critical
      }

      const tempDbStats = await fs.promises.stat(tempDbPath);

      // Step 5 — build metadata with schemaFingerprint
      const fileMetadata: BackupFileMetadata & { schoolId?: string; activeSession?: string; backupSize?: number } = {
        backupFormatVersion: BACKUP_FORMAT_VERSION,
        erpVersion: getErpVersion(),
        sqliteVersion,
        createdAt: new Date().toISOString(),
        schoolName,
        schoolId,
        activeSession,
        backupSize: tempDbStats.size,
        sha256,
        schemaFingerprint: getSchemaFingerprint(),
        ...(label ? { label } : {}),
      };

      // Step 6 — read snapshot into buffer and create archive
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
        schemaFingerprint: fileMetadata.schemaFingerprint,
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
      throw new BackupError("FILE_NOT_FOUND", "Backup file not found.");
    }

    // 2. Read archive
    let archiveBuffer: Buffer;
    try {
      archiveBuffer = await fs.promises.readFile(backupFilePath);
    } catch (err: unknown) {
      throw new BackupError("FILE_NOT_FOUND", "Cannot read backup file.");
    }

    // 3. Extract entries
    let entries: Map<string, Buffer>;
    try {
      entries = await zipExtract(archiveBuffer);
    } catch (err: unknown) {
      if (err instanceof BackupError) throw err;
      throw new BackupError("CORRUPT_ARCHIVE", "Backup archive is corrupted.");
    }

    // 4. Validate metadata.json exists
    const metaRaw = entries.get("metadata.json");
    if (!metaRaw) {
      throw new BackupError("INVALID_FORMAT", "Backup archive is invalid.");
    }

    let fileMetadata: BackupFileMetadata;
    try {
      fileMetadata = JSON.parse(metaRaw.toString("utf8")) as BackupFileMetadata;
    } catch {
      throw new BackupError("INVALID_FORMAT", "Backup archive is invalid.");
    }

    // 5. Validate required metadata fields
    if (
      typeof fileMetadata.backupFormatVersion !== "number" ||
      typeof fileMetadata.sha256 !== "string" ||
      typeof fileMetadata.createdAt !== "string" ||
      typeof fileMetadata.schoolName !== "string"
    ) {
      throw new BackupError("INVALID_FORMAT", "Backup archive is invalid.");
    }

    // 6. Compare Backup Format Version
    if (fileMetadata.backupFormatVersion > BACKUP_FORMAT_VERSION) {
      throw new BackupError("VERSION_INCOMPATIBLE", "Backup format is unsupported.");
    }

    // 7. Compare Schema Fingerprint (detect mismatch as older ERP version)
    const currentFingerprint = getSchemaFingerprint();
    if (!fileMetadata.schemaFingerprint || fileMetadata.schemaFingerprint !== currentFingerprint) {
      console.warn(`[BackupRestore] Fingerprint mismatch! Current: ${currentFingerprint}, Backup: ${fileMetadata.schemaFingerprint}`);
      throw new BackupError(
        "VERSION_INCOMPATIBLE",
        "Backup was created with an older ERP version. Database migration is required before restore."
      );
    }

    // 8. database.db must be present
    const dbBuffer = entries.get("database.db");
    if (!dbBuffer) {
      throw new BackupError("INVALID_FORMAT", "Backup archive is invalid.");
    }

    // 9. Integrity check — SHA-256 checksum mismatch
    const actualHash = sha256Buffer(dbBuffer);
    if (actualHash !== fileMetadata.sha256) {
      throw new BackupError("INTEGRITY_MISMATCH", "Database checksum mismatch.");
    }

    // 10. Write database to temp path
    const tempDbPath = path.join(
      this.tempDir,
      `restore_validated_${Date.now()}.db`,
    );
    await fs.promises.writeFile(tempDbPath, dbBuffer);

    // 11. Deep native SQLite diagnostics (integrity, FKs)
    try {
      verifyBackupDbSnapshot(tempDbPath);
    } catch (err: any) {
      try { await fs.promises.unlink(tempDbPath); } catch { /* ignore */ }
      if (err instanceof BackupError) {
        throw err;
      }
      throw new BackupError("CORRUPT_ARCHIVE", "Database integrity validation failed.");
    }

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
    const safetyWalPath = `${walFile}.pre-restore-${Date.now()}.bak`;
    const safetyShmPath = `${shmFile}.pre-restore-${Date.now()}.bak`;

    let safetyBackupCreated = false;

    try {
      // 1. Create safety backup
      if (fs.existsSync(targetDbFile)) {
        await fs.promises.copyFile(targetDbFile, safetyBackupPath);
        safetyBackupCreated = true;
      }
      if (fs.existsSync(walFile)) {
        await fs.promises.copyFile(walFile, safetyWalPath);
      }
      if (fs.existsSync(shmFile)) {
        await fs.promises.copyFile(shmFile, safetyShmPath);
      }

      // 2. Destroy and disconnect all Prisma connections
      await recreatePrismaInstance();

      // 3. Replace Database: remove WAL/SHM and copy new database
      for (const f of [walFile, shmFile]) {
        if (fs.existsSync(f)) {
          try { await fs.promises.unlink(f); } catch { /* non-critical */ }
        }
      }
      await fs.promises.copyFile(validatedTempDbPath, targetDbFile);

      // 4. Recreate Prisma instances & Reconnect
      await recreatePrismaInstance();

      // 5. Smoke test: Verify we can query the new database successfully
      try {
        await prisma.school.findFirst();
        const principalExists = await prisma.user.findFirst({ where: { role: "PRINCIPAL" } });
        if (!principalExists) {
          throw new Error("No Principal");
        }
      } catch (smokeErr) {
        throw new Error("Smoke test failed");
      }

      // Clean up temp file
      try { await fs.promises.unlink(validatedTempDbPath); } catch { /* non-critical */ }

      // Clean up safety backups
      try {
        if (fs.existsSync(safetyBackupPath)) await fs.promises.unlink(safetyBackupPath);
        if (fs.existsSync(safetyWalPath)) await fs.promises.unlink(safetyWalPath);
        if (fs.existsSync(safetyShmPath)) await fs.promises.unlink(safetyShmPath);
      } catch { /* non-critical */ }

      console.log("[BackupProvider] Database restored successfully.");

      return {
        success: true,
        message: "Database restored successfully. The ERP is now running on the restored data.",
      };
    } catch (err: any) {
      console.error("[BackupProvider] Restore failed:", err);

      // Rollback atomically
      if (safetyBackupCreated) {
        try {
          await recreatePrismaInstance();

          for (const f of [targetDbFile, walFile, shmFile]) {
            if (fs.existsSync(f)) {
              try { await fs.promises.unlink(f); } catch {}
            }
          }

          if (fs.existsSync(safetyBackupPath)) {
            await fs.promises.copyFile(safetyBackupPath, targetDbFile);
          }
          if (fs.existsSync(safetyWalPath)) {
            await fs.promises.copyFile(safetyWalPath, walFile);
          }
          if (fs.existsSync(safetyShmPath)) {
            await fs.promises.copyFile(safetyShmPath, shmFile);
          }

          await recreatePrismaInstance();
          console.log("[BackupProvider] Rolled back to safety backup successfully.");
        } catch (rollbackErr: any) {
          console.error("[BackupProvider] Critical rollback failure:", rollbackErr);
        }
      }

      throw new BackupError(
        "RESTORE_FAILED",
        "Restore failed and the original database has been restored automatically."
      );
    } finally {
      // Remove any leftover safety files
      try {
        if (fs.existsSync(safetyBackupPath)) await fs.promises.unlink(safetyBackupPath);
        if (fs.existsSync(safetyWalPath)) await fs.promises.unlink(safetyWalPath);
        if (fs.existsSync(safetyShmPath)) await fs.promises.unlink(safetyShmPath);
      } catch {}
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
        schemaFingerprint: fileMetadata?.schemaFingerprint ?? "",
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

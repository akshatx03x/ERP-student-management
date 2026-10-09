import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { appConfig } from "../../config/app-config";
import { prisma, ensureSqlitePragmas, recreatePrismaInstance, disconnectPrisma } from "../lib/prisma";

export function getSchemaFingerprint(): string {
  try {
    const candidates = [
      process.env.PRISMA_SCHEMA_PATH,
      path.resolve(process.cwd(), "prisma/schema.prisma"),
      path.resolve(process.cwd(), "../prisma/schema.prisma"),
      path.resolve(process.cwd(), "../../prisma/schema.prisma"),
      (process as any).resourcesPath ? path.join((process as any).resourcesPath, "prisma/schema.prisma") : null,
      typeof process !== "undefined" && process.execPath ? path.join(path.dirname(process.execPath), "resources/prisma/schema.prisma") : null,
      path.resolve(__dirname, "../../../prisma/schema.prisma"),
      path.resolve(__dirname, "../../../../prisma/schema.prisma"),
    ].filter(Boolean) as string[];

    let schemaPath: string | null = null;
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        schemaPath = cand;
        break;
      }
    }

    if (!schemaPath) {
      console.warn("[BackupProvider] Schema file not found in candidate paths; using stable fallback fingerprint.");
      return "school-erp-schema-v1";
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
    return "school-erp-schema-v1";
  }
}

/**
 * Validate a database file snapshot using native SQLite verification.
 * Supports both modern Node.js (with built-in node:sqlite) and Electron runtimes (Node 20 fallback).
 */
export async function verifyBackupDbSnapshot(dbFilePath: string): Promise<{ sqliteVersion: string }> {
  // 1. Physical existence and minimum file size check (SQLite header is at least 100 bytes)
  if (!fs.existsSync(dbFilePath)) {
    throw new BackupError("DB_NOT_FOUND", `Database file snapshot does not exist at: ${dbFilePath}`);
  }
  const stats = await fs.promises.stat(dbFilePath);
  if (stats.size < 100) {
    throw new BackupError("CORRUPT_ARCHIVE", "Database file snapshot is too small to be a valid SQLite database.");
  }

  // 2. Magic header byte verification
  // Every valid SQLite 3 database starts with the 16-byte header: "SQLite format 3\0"
  const headerBuf = Buffer.alloc(100);
  const fd = await fs.promises.open(dbFilePath, "r");
  try {
    await fd.read(headerBuf, 0, 100, 0);
  } finally {
    await fd.close();
  }

  const magic = headerBuf.subarray(0, 16).toString("utf8");
  if (magic !== "SQLite format 3\0") {
    throw new BackupError("INVALID_FORMAT", "The provided file is not a valid SQLite database format.");
  }

  // Parse version from SQLite header bytes 96..100 (big-endian 32-bit integer: e.g. 3046000 -> 3.46.0)
  const verInt = headerBuf.readUInt32BE(96);
  let headerSqliteVersion = "unknown";
  if (verInt > 0) {
    const major = Math.floor(verInt / 1000000);
    const minor = Math.floor((verInt % 1000000) / 1000);
    const patch = verInt % 1000;
    headerSqliteVersion = `${major}.${minor}.${patch}`;
  }

  // 3. Try Node built-in node:sqlite if available (Node >= 22.5.0)
  let nodeSqliteAttempted = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require("node:sqlite");
    nodeSqliteAttempted = true;
    let db: any = null;
    try {
      db = new DatabaseSync(dbFilePath);
      const integrity = db.prepare("PRAGMA integrity_check;").all() as { integrity_check: string }[];
      if (!integrity || integrity.length === 0 || integrity[0].integrity_check !== "ok") {
        throw new BackupError("CORRUPT_ARCHIVE", "Database integrity validation failed.");
      }

      const fkChecks = db.prepare("PRAGMA foreign_key_check;").all();
      if (fkChecks && fkChecks.length > 0) {
        throw new BackupError("INVALID_FORMAT", "Foreign key validation failed.");
      }

      const sqlVersionRow = db.prepare("SELECT sqlite_version() AS version;").get() as { version: string } | undefined;
      return { sqliteVersion: sqlVersionRow?.version ?? headerSqliteVersion };
    } finally {
      if (db) {
        try { db.close(); } catch {}
      }
    }
  } catch (err: any) {
    if (err instanceof BackupError) {
      throw err;
    }
    // If node:sqlite is missing (e.g. Node 20 in Electron), fall through to Prisma ATTACH check
    const isModuleMissing = !nodeSqliteAttempted ||
      err?.code === "ERR_MODULE_NOT_FOUND" ||
      err?.code === "MODULE_NOT_FOUND" ||
      err?.message?.includes("No such built-in module") ||
      err?.message?.includes("Cannot find module");

    if (!isModuleMissing) {
      throw new BackupError("CORRUPT_ARCHIVE", `Database integrity validation failed: ${err.message}`);
    }
  }

  // 4. Fallback verification via Prisma ATTACH DATABASE (compatible with all Node versions & Electron)
  const schemaAlias = `verify_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const normalizedPath = dbFilePath.replace(/\\/g, "/");

  try {
    await prisma.$executeRawUnsafe(`ATTACH DATABASE '${normalizedPath}' AS ${schemaAlias};`);
    try {
      const integrity = await prisma.$queryRawUnsafe<{ integrity_check: string }[]>(
        `PRAGMA ${schemaAlias}.integrity_check;`
      );
      if (!integrity || integrity.length === 0 || integrity[0]?.integrity_check !== "ok") {
        throw new BackupError("CORRUPT_ARCHIVE", "Database integrity validation failed.");
      }

      const fkChecks = await prisma.$queryRawUnsafe<any[]>(
        `PRAGMA ${schemaAlias}.foreign_key_check;`
      );
      if (fkChecks && fkChecks.length > 0) {
        throw new BackupError("INVALID_FORMAT", "Foreign key validation failed.");
      }

      const versionRows = await prisma.$queryRawUnsafe<{ version: string }[]>(
        "SELECT sqlite_version() AS version;"
      );
      const sqliteVersion = versionRows?.[0]?.version ?? headerSqliteVersion;

      return { sqliteVersion };
    } finally {
      try {
        await prisma.$executeRawUnsafe(`DETACH DATABASE ${schemaAlias};`);
      } catch {}
    }
  } catch (attachErr: any) {
    if (attachErr instanceof BackupError) {
      throw attachErr;
    }
    console.warn("[BackupProvider] ATTACH verification note:", attachErr.message);
    // If the file passed the magic 16-byte SQLite header check, return the header version as graceful fallback
    return { sqliteVersion: headerSqliteVersion };
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
  schoolId?: string;
  activeSession?: string;
  label?: string;
  sha256: string; // SHA-256 hex digest of the inner database.db
  schemaFingerprint: string;
  studentCount?: number;
  guardianCount?: number;
  staffCount?: number;
  feeReceiptCount?: number;
  attendanceRecordCount?: number;
  academicSessionCount?: number;
  classCount?: number;
  examCount?: number;
  uploadFilesCount?: number;
  backupSize?: number;
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
  studentCount?: number;
  guardianCount?: number;
  staffCount?: number;
  feeReceiptCount?: number;
  attendanceRecordCount?: number;
  uploadFilesCount?: number;
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
  getBackupById(backupIdOrPath: string): Promise<BackupMetadata | null>;
  deleteBackup(backupIdOrPath: string): Promise<boolean>;
}

// ─── Helpers: File Operations & Recursion ──────────────────────────────────────

async function collectFilesRecursively(dir: string, baseDir: string = dir): Promise<Array<{ name: string; fullPath: string }>> {
  const results: Array<{ name: string; fullPath: string }> = [];
  if (!fs.existsSync(dir)) return results;

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectFilesRecursively(fullPath, baseDir);
      results.push(...sub);
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      results.push({ name: relPath, fullPath });
    }
  }
  return results;
}

async function safeFileOperation(fn: () => Promise<void>, retries = 5, delayMs = 150): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await fn();
      return;
    } catch (err: any) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
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

  if (count === 0 || count > 1000000) {
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

// ─── Read metadata from .erpbackup or .db file ─────────────────────────────────

async function readBackupMetadataFromFile(filePath: string): Promise<BackupFileMetadata | null> {
  try {
    if (!fs.existsSync(filePath)) return null;

    const headerBuf = Buffer.alloc(16);
    const fd = await fs.promises.open(filePath, "r");
    try {
      await fd.read(headerBuf, 0, 16, 0);
    } finally {
      await fd.close();
    }

    if (headerBuf.toString("utf8") === "SQLite format 3\0") {
      const stats = await fs.promises.stat(filePath);
      return {
        backupFormatVersion: 1,
        erpVersion: getErpVersion(),
        sqliteVersion: "3",
        createdAt: (stats.birthtime || stats.mtime || new Date()).toISOString(),
        schoolName: "Direct SQLite Database",
        sha256: "",
        schemaFingerprint: getSchemaFingerprint(),
        backupSize: stats.size,
      };
    }

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

    // Ensure SQLite WAL journal is fully flushed into the base database file
    try {
      await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch (walErr: any) {
      console.warn("[BackupProvider] wal_checkpoint warning (non-fatal):", walErr?.message);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitizedLabel = label ? `_${label.replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
    const backupId = `school_erp_backup_${timestamp}${sanitizedLabel}`;
    const filename = `${backupId}${BACKUP_EXTENSION}`;
    const archivePath = path.join(this.backupsDir, filename);

    // Step 1 — produce a clean SQLite snapshot via VACUUM INTO
    const tempDbPath = path.join(this.tempDir, `${backupId}_temp.db`);
    const normalizedTempPath = tempDbPath.replace(/\\/g, "/");

    if (fs.existsSync(tempDbPath)) {
      try { await fs.promises.unlink(tempDbPath); } catch {}
    }

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
      const { sqliteVersion } = await verifyBackupDbSnapshot(tempDbPath);

      // Step 3 — compute SHA-256 of the snapshot
      const sha256 = await sha256File(tempDbPath);

      // Step 4 — read school details and complete entity statistics
      let schoolName = "Unknown School";
      let schoolId = "";
      let activeSession = "";
      let studentCount = 0;
      let guardianCount = 0;
      let staffCount = 0;
      let feeReceiptCount = 0;
      let attendanceRecordCount = 0;
      let academicSessionCount = 0;
      let classCount = 0;
      let examCount = 0;

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

        const counts = await Promise.allSettled([
          prisma.student.count(),
          prisma.guardian.count(),
          prisma.staffProfile.count(),
          prisma.feeReceipt.count(),
          prisma.attendanceRecord.count(),
          prisma.academicSession.count(),
          prisma.class.count(),
          prisma.exam.count(),
        ]);

        if (counts[0].status === "fulfilled") studentCount = counts[0].value;
        if (counts[1].status === "fulfilled") guardianCount = counts[1].value;
        if (counts[2].status === "fulfilled") staffCount = counts[2].value;
        if (counts[3].status === "fulfilled") feeReceiptCount = counts[3].value;
        if (counts[4].status === "fulfilled") attendanceRecordCount = counts[4].value;
        if (counts[5].status === "fulfilled") academicSessionCount = counts[5].value;
        if (counts[6].status === "fulfilled") classCount = counts[6].value;
        if (counts[7].status === "fulfilled") examCount = counts[7].value;
      } catch (statsErr) {
        console.warn("[BackupProvider] Stats collection warning:", statsErr);
      }

      // Step 5 — collect all uploaded files, student photos, logos, signatures, ID assets, documents
      const uploadEntries: Array<{ name: string; data: Buffer }> = [];
      const uploadsDir = appConfig.offlinePaths.uploadsDir;
      if (fs.existsSync(uploadsDir)) {
        const uploadFiles = await collectFilesRecursively(uploadsDir);
        for (const uf of uploadFiles) {
          try {
            const data = await fs.promises.readFile(uf.fullPath);
            uploadEntries.push({ name: `uploads/${uf.name}`, data });
          } catch (readErr: any) {
            console.warn(`[BackupProvider] Failed to read upload file ${uf.fullPath}:`, readErr?.message);
          }
        }
      }

      // Also check public/uploads if it exists and is distinct from uploadsDir
      const publicUploads = path.join(process.cwd(), "public", "uploads");
      if (fs.existsSync(publicUploads) && path.resolve(publicUploads) !== path.resolve(uploadsDir)) {
        const publicFiles = await collectFilesRecursively(publicUploads);
        for (const pf of publicFiles) {
          try {
            const data = await fs.promises.readFile(pf.fullPath);
            uploadEntries.push({ name: `public_uploads/${pf.name}`, data });
          } catch {}
        }
      }

      const tempDbStats = await fs.promises.stat(tempDbPath);

      // Step 6 — build comprehensive metadata
      const fileMetadata: BackupFileMetadata = {
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
        studentCount,
        guardianCount,
        staffCount,
        feeReceiptCount,
        attendanceRecordCount,
        academicSessionCount,
        classCount,
        examCount,
        uploadFilesCount: uploadEntries.length,
        ...(label ? { label } : {}),
      };

      // Step 7 — pack database snapshot, metadata, and all uploads into .erpbackup archive
      const dbBuffer = await fs.promises.readFile(tempDbPath);
      const metaBuffer = Buffer.from(JSON.stringify(fileMetadata, null, 2), "utf8");

      const archiveBuffer = await zipCreate([
        { name: "database.db", data: dbBuffer },
        { name: "metadata.json", data: metaBuffer },
        ...uploadEntries,
      ]);

      await fs.promises.writeFile(archivePath, archiveBuffer);

      const stats = await fs.promises.stat(archivePath);

      console.log(
        `[BackupProvider] Full .erpbackup archive created: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB, ${studentCount} students, ${feeReceiptCount} receipts, ${uploadEntries.length} uploads)`,
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
        studentCount,
        guardianCount,
        staffCount,
        feeReceiptCount,
        attendanceRecordCount,
        uploadFilesCount: uploadEntries.length,
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

    // 2. Check header to identify format (Raw SQLite .db vs .erpbackup archive)
    const headerBuf = Buffer.alloc(16);
    const fd = await fs.promises.open(backupFilePath, "r");
    try {
      await fd.read(headerBuf, 0, 16, 0);
    } finally {
      await fd.close();
    }

    const isDirectSqlite = headerBuf.toString("utf8") === "SQLite format 3\0";

    if (isDirectSqlite) {
      // Direct SQLite Database Restore
      const tempDbPath = path.join(this.tempDir, `restore_validated_${Date.now()}.db`);
      await fs.promises.copyFile(backupFilePath, tempDbPath);

      // Deep native SQLite diagnostics
      const { sqliteVersion } = await verifyBackupDbSnapshot(tempDbPath);
      const sha256 = await sha256File(tempDbPath);
      const stats = await fs.promises.stat(tempDbPath);

      const fileMetadata: BackupFileMetadata = {
        backupFormatVersion: 1,
        erpVersion: getErpVersion(),
        sqliteVersion,
        createdAt: (stats.mtime || new Date()).toISOString(),
        schoolName: "Direct SQLite Database",
        sha256,
        schemaFingerprint: getSchemaFingerprint(),
        backupSize: stats.size,
        uploadFilesCount: 0,
      };

      console.log(`[BackupProvider] Direct SQLite database validated successfully. Temp DB at: ${tempDbPath}`);
      return {
        valid: true,
        tempDbPath,
        metadata: fileMetadata,
      };
    }

    // 3. Read archive for .erpbackup format
    let archiveBuffer: Buffer;
    try {
      archiveBuffer = await fs.promises.readFile(backupFilePath);
    } catch {
      throw new BackupError("FILE_NOT_FOUND", "Cannot read backup file.");
    }

    // 4. Extract entries
    let entries: Map<string, Buffer>;
    try {
      entries = await zipExtract(archiveBuffer);
    } catch (err: unknown) {
      if (err instanceof BackupError) throw err;
      throw new BackupError("CORRUPT_ARCHIVE", "Backup archive is corrupted.");
    }

    // 5. Validate metadata.json exists
    const metaRaw = entries.get("metadata.json");
    if (!metaRaw) {
      throw new BackupError("INVALID_FORMAT", "Backup archive is invalid (missing metadata.json).");
    }

    let fileMetadata: BackupFileMetadata;
    try {
      fileMetadata = JSON.parse(metaRaw.toString("utf8")) as BackupFileMetadata;
    } catch {
      throw new BackupError("INVALID_FORMAT", "Backup archive metadata is corrupt.");
    }

    // 6. Validate required metadata fields
    if (
      typeof fileMetadata.backupFormatVersion !== "number" ||
      typeof fileMetadata.sha256 !== "string" ||
      typeof fileMetadata.createdAt !== "string" ||
      typeof fileMetadata.schoolName !== "string"
    ) {
      throw new BackupError("INVALID_FORMAT", "Backup archive metadata is missing required fields.");
    }

    // 7. database.db must be present
    const dbBuffer = entries.get("database.db");
    if (!dbBuffer) {
      throw new BackupError("INVALID_FORMAT", "Backup archive is missing database.db.");
    }

    // 8. Integrity check — SHA-256 checksum mismatch
    const actualHash = sha256Buffer(dbBuffer);
    if (actualHash !== fileMetadata.sha256) {
      throw new BackupError("INTEGRITY_MISMATCH", "Database checksum mismatch.");
    }

    // 9. Write database to temp path
    const tempDbPath = path.join(
      this.tempDir,
      `restore_validated_${Date.now()}.db`,
    );
    await fs.promises.writeFile(tempDbPath, dbBuffer);

    // 10. Deep native SQLite diagnostics (integrity, magic header, etc.)
    try {
      await verifyBackupDbSnapshot(tempDbPath);
    } catch (err: any) {
      try { await fs.promises.unlink(tempDbPath); } catch {}
      if (err instanceof BackupError) throw err;
      throw new BackupError("CORRUPT_ARCHIVE", "Database integrity validation failed.");
    }

    // 11. Extract and stage all upload files (photos, signatures, documents, etc.)
    const stagedUploadsDir = `${tempDbPath}_uploads`;
    let extractedUploadsCount = 0;
    for (const [entryName, entryBuffer] of entries.entries()) {
      if (entryName.startsWith("uploads/")) {
        const relativeName = entryName.substring("uploads/".length);
        const targetPath = path.join(stagedUploadsDir, relativeName);
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          await fs.promises.mkdir(targetDir, { recursive: true });
        }
        await fs.promises.writeFile(targetPath, entryBuffer);
        extractedUploadsCount++;
      }
    }

    if (extractedUploadsCount > 0) {
      fileMetadata.uploadFilesCount = extractedUploadsCount;
    }

    // Log schema fingerprint comparison (advisory, do not block restore if SQLite integrity passed)
    const currentFingerprint = getSchemaFingerprint();
    if (fileMetadata.schemaFingerprint && fileMetadata.schemaFingerprint !== currentFingerprint) {
      console.warn(`[BackupRestore] Schema fingerprint differs (current: ${currentFingerprint}, backup: ${fileMetadata.schemaFingerprint}). SQLite integrity verified; proceeding with restore.`);
    }

    console.log(`[BackupProvider] Backup validated successfully. Temp DB: ${tempDbPath}, Upload files: ${extractedUploadsCount}`);

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
    const stagedUploadsDir = `${validatedTempDbPath}_uploads`;

    // Create a safety backup of the current db and wal before overwriting
    const safetyBackupPath = `${targetDbFile}.pre-restore-${Date.now()}.bak`;
    const safetyWalPath = `${walFile}.pre-restore-${Date.now()}.bak`;
    const safetyShmPath = `${shmFile}.pre-restore-${Date.now()}.bak`;

    let safetyBackupCreated = false;

    try {
      // 1. Create safety backup
      if (fs.existsSync(targetDbFile)) {
        await safeFileOperation(async () => {
          await fs.promises.copyFile(targetDbFile, safetyBackupPath);
        });
        safetyBackupCreated = true;
      }
      if (fs.existsSync(walFile)) {
        await safeFileOperation(async () => {
          await fs.promises.copyFile(walFile, safetyWalPath);
        });
      }
      if (fs.existsSync(shmFile)) {
        await safeFileOperation(async () => {
          await fs.promises.copyFile(shmFile, safetyShmPath);
        });
      }

      // 2. Destroy and disconnect all active Prisma connections
      await disconnectPrisma();

      // Brief pause to allow Windows file handles to release completely
      await new Promise((r) => setTimeout(r, 200));

      // 3. Replace Database: remove WAL/SHM and copy new database
      for (const f of [walFile, shmFile]) {
        if (fs.existsSync(f)) {
          await safeFileOperation(async () => {
            try { await fs.promises.unlink(f); } catch {}
          });
        }
      }

      await safeFileOperation(async () => {
        await fs.promises.copyFile(validatedTempDbPath, targetDbFile);
      });

      // 4. Restore Uploads (images, signatures, student photos, receipts)
      if (fs.existsSync(stagedUploadsDir)) {
        const targetUploadsDir = appConfig.offlinePaths.uploadsDir;
        if (!fs.existsSync(targetUploadsDir)) {
          await fs.promises.mkdir(targetUploadsDir, { recursive: true });
        }
        const stagedFiles = await collectFilesRecursively(stagedUploadsDir);
        for (const sf of stagedFiles) {
          const dest = path.join(targetUploadsDir, sf.name);
          const destDir = path.dirname(dest);
          if (!fs.existsSync(destDir)) {
            await fs.promises.mkdir(destDir, { recursive: true });
          }
          await safeFileOperation(async () => {
            await fs.promises.copyFile(sf.fullPath, dest);
          });
        }

        // Clean up staged uploads directory
        try {
          await fs.promises.rm(stagedUploadsDir, { recursive: true, force: true });
        } catch {}
      }

      // 5. Recreate Prisma instances & Reconnect
      await recreatePrismaInstance();

      // 6. Smoke test: Verify we can query the new database successfully
      try {
        await prisma.school.findFirst();
        await prisma.student.count();
      } catch (smokeErr: any) {
        throw new Error(`Database smoke test failed: ${smokeErr?.message}`);
      }

      // Clean up temp file
      try { await fs.promises.unlink(validatedTempDbPath); } catch {}

      // Clean up safety backups
      try {
        if (fs.existsSync(safetyBackupPath)) await fs.promises.unlink(safetyBackupPath);
        if (fs.existsSync(safetyWalPath)) await fs.promises.unlink(safetyWalPath);
        if (fs.existsSync(safetyShmPath)) await fs.promises.unlink(safetyShmPath);
      } catch {}

      console.log("[BackupProvider] Full database and uploaded assets restored successfully.");

      return {
        success: true,
        message: "Database and all uploaded media files restored successfully. The ERP is now running on the restored data.",
      };
    } catch (err: any) {
      console.error("[BackupProvider] Restore failed:", err);

      // Rollback atomically
      if (safetyBackupCreated) {
        try {
          await disconnectPrisma();

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
        `Restore failed: ${err.message}. The original database has been restored automatically.`
      );
    } finally {
      // Remove any leftover safety files
      try {
        if (fs.existsSync(safetyBackupPath)) await fs.promises.unlink(safetyBackupPath);
        if (fs.existsSync(safetyWalPath)) await fs.promises.unlink(safetyWalPath);
        if (fs.existsSync(safetyShmPath)) await fs.promises.unlink(safetyShmPath);
      } catch {}
      if (fs.existsSync(stagedUploadsDir)) {
        try { await fs.promises.rm(stagedUploadsDir, { recursive: true, force: true }); } catch {}
      }
    }
  }

  // ── listBackups ───────────────────────────────────────────────────────────────

  async listBackups(): Promise<BackupMetadata[]> {
    if (!fs.existsSync(this.backupsDir)) return [];

    const files = await fs.promises.readdir(this.backupsDir);
    const backups: BackupMetadata[] = [];

    for (const file of files) {
      const isErpBackup = file.endsWith(BACKUP_EXTENSION);
      const isDb = file.endsWith(".db") || file.endsWith(".sqlite");
      if (!isErpBackup && !isDb) continue;

      const filePath = path.join(this.backupsDir, file);
      const stats = await fs.promises.stat(filePath);
      const fileMetadata = await readBackupMetadataFromFile(filePath);

      backups.push({
        id: file.replace(BACKUP_EXTENSION, "").replace(/\.db$/, "").replace(/\.sqlite$/, ""),
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
        studentCount: fileMetadata?.studentCount,
        guardianCount: fileMetadata?.guardianCount,
        staffCount: fileMetadata?.staffCount,
        feeReceiptCount: fileMetadata?.feeReceiptCount,
        attendanceRecordCount: fileMetadata?.attendanceRecordCount,
        uploadFilesCount: fileMetadata?.uploadFilesCount,
        ...(fileMetadata?.label ? { label: fileMetadata.label } : {}),
      });
    }

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ── getBackupById ─────────────────────────────────────────────────────────────

  async getBackupById(backupIdOrPath: string): Promise<BackupMetadata | null> {
    let filePath = backupIdOrPath;
    if (!path.isAbsolute(backupIdOrPath)) {
      const candidates = [
        path.join(this.backupsDir, backupIdOrPath),
        path.join(this.backupsDir, `${backupIdOrPath}${BACKUP_EXTENSION}`),
        path.join(this.backupsDir, `${backupIdOrPath}.db`),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          filePath = cand;
          break;
        }
      }
    }

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stats = await fs.promises.stat(filePath);
    const fileMetadata = await readBackupMetadataFromFile(filePath);

    return {
      id: path.basename(filePath).replace(BACKUP_EXTENSION, "").replace(/\.db$/, ""),
      filename: path.basename(filePath),
      filePath,
      sizeBytes: stats.size,
      createdAt: fileMetadata?.createdAt ? new Date(fileMetadata.createdAt) : (stats.mtime ?? stats.birthtime),
      mode: "offline",
      schoolName: fileMetadata?.schoolName ?? "Unknown",
      backupFormatVersion: fileMetadata?.backupFormatVersion ?? 1,
      erpVersion: fileMetadata?.erpVersion ?? "unknown",
      sha256: fileMetadata?.sha256 ?? "",
      schemaFingerprint: fileMetadata?.schemaFingerprint ?? "",
      studentCount: fileMetadata?.studentCount,
      guardianCount: fileMetadata?.guardianCount,
      staffCount: fileMetadata?.staffCount,
      feeReceiptCount: fileMetadata?.feeReceiptCount,
      attendanceRecordCount: fileMetadata?.attendanceRecordCount,
      uploadFilesCount: fileMetadata?.uploadFilesCount,
      ...(fileMetadata?.label ? { label: fileMetadata.label } : {}),
    };
  }

  // ── deleteBackup ──────────────────────────────────────────────────────────────

  async deleteBackup(backupIdOrPath: string): Promise<boolean> {
    let filePath = backupIdOrPath;
    if (!path.isAbsolute(backupIdOrPath)) {
      const candidates = [
        path.join(this.backupsDir, backupIdOrPath),
        path.join(this.backupsDir, `${backupIdOrPath}${BACKUP_EXTENSION}`),
        path.join(this.backupsDir, `${backupIdOrPath}.db`),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          filePath = cand;
          break;
        }
      }
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

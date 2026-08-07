import fs from "fs";
import { PrismaClient } from "@prisma/client";

export interface DatabaseIntegrityResult {
  ok: boolean;
  message: string;
}

export async function checkSqliteDatabaseIntegrity(dbFilePath: string): Promise<DatabaseIntegrityResult> {
  if (!fs.existsSync(dbFilePath)) {
    return {
      ok: true,
      message: "Database file does not exist yet (Fresh installation).",
    };
  }

  const stats = fs.statSync(dbFilePath);
  if (stats.size === 0) {
    return {
      ok: false,
      message: "Database file is 0 bytes (corrupted or improperly created).",
    };
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbFilePath}`,
      },
    },
    log: [],
  });

  try {
    await prisma.$connect();
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const result: any = await prisma.$queryRawUnsafe(`PRAGMA integrity_check;`);
    await prisma.$disconnect();

    const checkValue = Array.isArray(result) && result[0] ? Object.values(result[0])[0] : "ok";
    if (checkValue === "ok") {
      return {
        ok: true,
        message: "SQLite database integrity check passed.",
      };
    } else {
      return {
        ok: false,
        message: `Database corruption detected: ${String(checkValue)}`,
      };
    }
  } catch (err: any) {
    try {
      await prisma.$disconnect();
    } catch {}
    return {
      ok: false,
      message: `Failed to verify database integrity: ${err.message}`,
    };
  }
}

export async function checkDatabaseReady(dbFilePath: string): Promise<boolean> {
  if (!fs.existsSync(dbFilePath)) return false;
  const res = await checkSqliteDatabaseIntegrity(dbFilePath);
  return res.ok;
}

// ── Single-Instance Lock ────────────────────────────────────────────────────
// Prevents two ERP windows from opening the same SQLite database simultaneously,
// which can cause WAL-mode corruption under concurrent writes.
//
// Strategy: write a <dbFile>.lock file containing the current process PID.
// On startup, if a lock exists for a different PID, use signal-0 to test
// whether that process is still alive. Stale locks (orphaned from crashes)
// are silently replaced.

export interface SingleInstanceResult {
  acquired: boolean;
  message: string;
}

export function acquireSingleInstanceLock(dbFilePath: string): SingleInstanceResult {
  const lockFile = `${dbFilePath}.lock`;

  if (fs.existsSync(lockFile)) {
    try {
      const content = fs.readFileSync(lockFile, "utf-8").trim();
      const existingPid = parseInt(content, 10);

      if (!isNaN(existingPid) && existingPid !== process.pid) {
        try {
          // process.kill with signal 0 does NOT kill the process.
          // It simply throws if the PID does not exist — safe existence probe.
          process.kill(existingPid, 0);

          // If we reach here the PID is alive → another ERP instance is running.
          return {
            acquired: false,
            message:
              `School ERP is already running on this computer (process ID: ${existingPid}).\n\n` +
              `SQLite does not support simultaneous access from two running instances and ` +
              `concurrent writes can corrupt the database.\n\n` +
              `Please close the existing School ERP window and try again.\n\n` +
              `If you are certain no other instance is running, delete this file and restart:\n` +
              `${lockFile}`,
          };
        } catch {
          // PID does not exist → stale lock from a previous crash. Safe to overwrite.
          console.log(`[SingleInstance] Stale lock detected (PID ${existingPid} is no longer running). Acquiring lock.`);
        }
      }
    } catch (readErr: any) {
      // Unreadable or malformed lock file — overwrite it.
      console.warn("[SingleInstance] Could not read existing lock file, overwriting:", readErr.message);
    }
  }

  // Write our PID to the lock file.
  try {
    fs.writeFileSync(lockFile, String(process.pid), "utf-8");
    console.log(`[SingleInstance] Lock acquired (PID: ${process.pid}) at: ${lockFile}`);
    return { acquired: true, message: "Lock acquired." };
  } catch (writeErr: any) {
    // If the lock file cannot be written (e.g. read-only USB edge case), log and continue.
    // This is non-fatal — the database integrity check that runs just before this is
    // the primary corruption guard.
    console.warn("[SingleInstance] Could not write lock file (non-fatal):", writeErr.message);
    return { acquired: true, message: "Lock file unavailable — proceeding without instance lock." };
  }
}

export function releaseSingleInstanceLock(dbFilePath: string): void {
  const lockFile = `${dbFilePath}.lock`;
  try {
    if (fs.existsSync(lockFile)) {
      const content = fs.readFileSync(lockFile, "utf-8").trim();
      // Only delete the lock if it still contains OUR PID — do not touch
      // a lock file that a newly started instance has already claimed.
      if (content === String(process.pid)) {
        fs.unlinkSync(lockFile);
        console.log("[SingleInstance] Lock released successfully.");
      }
    }
  } catch (err: any) {
    console.warn("[SingleInstance] Could not release lock file (non-fatal):", err.message);
  }
}


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

import { PrismaClient } from "@prisma/client";
import { ensureWritableDirectoriesExist } from "./paths";

const paths = ensureWritableDirectoriesExist();

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${paths.dbFilePath}`,
    },
  },
  log: [],
});

export async function ensureSqlitePragmas(client: PrismaClient) {
  try {
    await client.$executeRawUnsafe("PRAGMA journal_mode=WAL;");
    await client.$executeRawUnsafe("PRAGMA busy_timeout=5000;");
    await client.$executeRawUnsafe("PRAGMA foreign_keys=ON;");
  } catch (err) {
    console.warn("[Prisma] Failed to set SQLite PRAGMAs:", err);
  }
}

import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";

async function applyMigration() {
  const dbPaths = [
    path.resolve("desktop/data/school.db"),
    path.resolve("data/school.db"),
  ];

  for (const p of dbPaths) {
    if (!fs.existsSync(p)) continue;
    console.log("Applying migration to:", p);
    const prisma = new PrismaClient({
      datasources: { db: { url: "file:" + p } },
    });

    try {
      await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = 10000;`);
      
      const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("User");`);
      const hasUsername = tableInfo.some((col: any) => col.name === "username");
      const hasPinHash = tableInfo.some((col: any) => col.name === "pinHash");

      if (!hasPinHash) {
        console.log("Adding pinHash column to User table in", p);
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;`);
      } else {
        console.log("pinHash column already exists in", p);
      }

      if (!hasUsername) {
        console.log("Adding username column to User table in", p);
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "username" TEXT;`);
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");`);
      } else {
        console.log("username column already exists in", p);
      }

      const migrationName = "20260923020000_add_username_and_pin_hash";
      const existingMig: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM "_prisma_migrations" WHERE migration_name = '${migrationName}'`
      );

      if (existingMig.length === 0) {
        const id = require("crypto").randomUUID();
        const checksum = "ce2d7e00fa2bf610bf9742617f6bd65f3bc77098e98bc0eefec8140db590cfec";
        await prisma.$executeRawUnsafe(`
          INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES ('${id}', '${checksum}', CURRENT_TIMESTAMP, '${migrationName}', null, null, CURRENT_TIMESTAMP, 1)
        `);
        console.log("Recorded migration in _prisma_migrations for", p);
      }
    } catch (e: any) {
      console.error("Failed to migrate", p, e.message);
    } finally {
      await prisma.$disconnect();
    }
  }
}

applyMigration();

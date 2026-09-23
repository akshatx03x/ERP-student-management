import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";

async function check() {
  const dbPaths = [
    path.resolve("desktop/data/school.db"),
    path.resolve("data/school.db"),
  ];

  for (const p of dbPaths) {
    console.log("Checking path:", p, "exists:", fs.existsSync(p));
    if (fs.existsSync(p)) {
      const prisma = new PrismaClient({
        datasources: { db: { url: "file:" + p } },
      });
      try {
        const rawUsers: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "User"`);
        console.log(`=== Raw Users in ${p} (${rawUsers.length}) ===`);
        for (const u of rawUsers) {
          console.log({ id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, keys: Object.keys(u) });
        }
        const rawAccounts: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "Account"`);
        console.log(`=== Raw Accounts in ${p} (${rawAccounts.length}) ===`);
        for (const a of rawAccounts) {
          console.log({ id: a.id, userId: a.userId, accountId: a.accountId, providerId: a.providerId, passLength: a.password?.length });
        }
      } catch (e: any) {
        console.error("Error reading", p, e.message);
      } finally {
        await prisma.$disconnect();
      }
    }
  }
}

check();

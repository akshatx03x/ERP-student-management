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
        const rawUsers: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "User" WHERE email = 'principal@vidyanjali.edu.in' OR role = 'PRINCIPAL'`);
        console.log(`=== Principal Users in ${p} (${rawUsers.length}) ===`);
        for (const u of rawUsers) {
          console.log("User:", u);
          const rawAccounts: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "Account" WHERE userId = '${u.id}'`);
          console.log("Accounts for user:", rawAccounts);
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

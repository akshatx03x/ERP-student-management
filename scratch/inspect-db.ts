import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";

async function check() {
  const dbPaths = [
    path.resolve("desktop/data/school.db"),
    path.resolve("data/school.db"),
    "C:/Users/Akshat/AppData/Roaming/school-erp-desktop/data/school.db",
  ];

  for (const p of dbPaths) {
    console.log("Checking path:", p, "exists:", fs.existsSync(p));
    if (fs.existsSync(p)) {
      const prisma = new PrismaClient({
        datasources: { db: { url: "file:" + p } },
      });
      try {
        const users = await prisma.user.findMany({
          include: { accounts: true },
        });
        console.log(`=== Users in ${p} (${users.length}) ===`);
        for (const u of users) {
          console.log({
            id: u.id,
            email: u.email,
            username: u.username,
            role: u.role,
            isActive: u.isActive,
            pinHash: u.pinHash,
            accountsCount: u.accounts.length,
            accounts: u.accounts.map((a) => ({
              id: a.id,
              accountId: a.accountId,
              providerId: a.providerId,
              passwordLength: a.password?.length,
              passwordPrefix: a.password?.slice(0, 35),
            })),
          });
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

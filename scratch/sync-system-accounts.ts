import { PrismaClient, Role } from "@prisma/client";
import path from "path";
import fs from "fs";
import { hashPassword, verifyPassword } from "better-auth/crypto";

const SEED_PASSWORD = "vidyanjalierp@890";
const SEED_PIN = "0396";

async function syncSystemAccounts() {
  const dbPaths = [
    path.resolve("desktop/data/school.db"),
    path.resolve("data/school.db"),
  ];

  const hashedPassword = await hashPassword(SEED_PASSWORD);
  const defaultPinHash = await hashPassword(SEED_PIN);

  for (const p of dbPaths) {
    if (!fs.existsSync(p)) continue;
    console.log("\nSynchronizing system accounts in:", p);
    const prisma = new PrismaClient({
      datasources: { db: { url: "file:" + p } },
    });

    try {
      const school = await prisma.school.findFirst({ orderBy: { createdAt: "asc" } });
      if (!school) {
        console.log("No school found in", p);
        continue;
      }

      // Principal email check & update
      let principal = await prisma.user.findFirst({
        where: { role: Role.PRINCIPAL, email: "principal@vidyanjali.edu.in" },
        include: { accounts: true },
      });

      if (!principal) {
        principal = await prisma.user.findFirst({
          where: { role: Role.PRINCIPAL },
          include: { accounts: true },
        });
      }

      if (principal) {
        console.log("Found principal user:", principal.id, principal.email);
        await prisma.user.update({
          where: { id: principal.id },
          data: {
            email: "principal@vidyanjali.edu.in",
            username: "Principal",
            pinHash: defaultPinHash,
            isActive: true,
            role: Role.PRINCIPAL,
          },
        });

        // Ensure account record exists with valid password
        const account = await prisma.account.findFirst({
          where: { userId: principal.id },
        });

        if (account) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              accountId: "principal@vidyanjali.edu.in",
              password: hashedPassword,
            },
          });
          console.log("Updated account credentials for Principal ✓");
        } else {
          await prisma.account.create({
            data: {
              userId: principal.id,
              accountId: "principal@vidyanjali.edu.in",
              providerId: "credential",
              password: hashedPassword,
            },
          });
          console.log("Created account record for Principal ✓");
        }
      }

      // Developer email check & update
      let dev = await prisma.user.findFirst({
        where: { role: Role.DEVELOPER },
        include: { accounts: true },
      });

      if (!dev) {
        let staff = await prisma.staffProfile.findFirst({
          where: { schoolId: school.id, employeeCode: "SYS-DEV" },
        });
        if (!staff) {
          staff = await prisma.staffProfile.create({
            data: {
              schoolId: school.id,
              employeeCode: "SYS-DEV",
              fullName: "Developer",
              designation: "System Developer",
              role: Role.DEVELOPER,
            },
          });
        }
        dev = await prisma.user.create({
          data: {
            schoolId: school.id,
            name: "Developer",
            email: "developer@vidyanjali.edu.in",
            emailVerified: true,
            role: Role.DEVELOPER,
            isActive: true,
            mustChangePassword: false,
            loginIdentifier: "developer@vidyanjali.edu.in",
            staffProfileId: staff.id,
            accounts: {
              create: {
                accountId: "developer@vidyanjali.edu.in",
                providerId: "credential",
                password: hashedPassword,
              },
            },
          },
          include: { accounts: true },
        });
        console.log("Created developer user ✓");
      } else {
        await prisma.user.update({
          where: { id: dev.id },
          data: { email: "developer@vidyanjali.edu.in", isActive: true, role: Role.DEVELOPER },
        });
        const devAccount = await prisma.account.findFirst({ where: { userId: dev.id } });
        if (devAccount) {
          await prisma.account.update({
            where: { id: devAccount.id },
            data: { accountId: "developer@vidyanjali.edu.in", password: hashedPassword },
          });
        } else {
          await prisma.account.create({
            data: {
              userId: dev.id,
              accountId: "developer@vidyanjali.edu.in",
              providerId: "credential",
              password: hashedPassword,
            },
          });
        }
        console.log("Updated developer user ✓");
      }

      // Verification test
      const updatedPrincipal = await prisma.user.findFirst({
        where: { email: "principal@vidyanjali.edu.in" },
        include: { accounts: true },
      });

      if (updatedPrincipal && updatedPrincipal.pinHash) {
        const pinValid = await verifyPassword({ password: SEED_PIN, hash: updatedPrincipal.pinHash });
        console.log("Verification test -> PIN '0396' valid:", pinValid);
      }
      if (updatedPrincipal && updatedPrincipal.accounts[0]?.password) {
        const passValid = await verifyPassword({ password: SEED_PASSWORD, hash: updatedPrincipal.accounts[0].password });
        console.log("Verification test -> Password 'vidyanjalierp@890' valid:", passValid);
      }
    } catch (e: any) {
      console.error("Failed sync for", p, e);
    } finally {
      await prisma.$disconnect();
    }
  }
}

syncSystemAccounts();

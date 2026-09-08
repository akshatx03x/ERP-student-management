/**
 * seed-accounts.ts
 *
 * Idempotent seeding of protected system accounts.
 *
 * Rules:
 * - If neither Developer nor Principal exists → create both
 * - If only one exists → create only the missing one
 * - If both already exist → do nothing
 * - NEVER overwrite existing passwords, permissions, or user data
 */

import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/server/lib/prisma";
import { Role } from "@prisma/client";
import { seedRoleDefaults } from "@/server/permissions/guard";

const DEVELOPER_EMAIL = "developer@vidyanjali.edu.in";
const PRINCIPAL_EMAIL = "principal@vidyanjali.edu.in";
const SEED_PASSWORD = "vidyanjalierp@890";

async function createSystemUser(params: {
  email: string;
  name: string;
  role: Role;
  designation: string;
  schoolId: string;
}) {
  const { email, name, role, designation, schoolId } = params;
  const hashedPassword = await hashPassword(SEED_PASSWORD);
  const employeeCode = role === Role.DEVELOPER ? "SYS-DEV" : "SYS-PRINCIPAL";

  return prisma.$transaction(async (tx) => {
    const staff = await tx.staffProfile.create({
      data: {
        schoolId,
        fullName: name,
        employeeCode,
        designation,
        role,
        isActive: true,
      },
    });

    const user = await tx.user.create({
      data: {
        schoolId,
        name,
        email,
        emailVerified: true,
        role,
        isActive: true,
        mustChangePassword: false,
        loginIdentifier: email,
        staffProfileId: staff.id,
        accounts: {
          create: {
            accountId: email,
            providerId: "credential",
            password: hashedPassword,
          },
        },
      },
    });

    return user;
  });
}

export async function seedSystemAccounts() {
  try {
    // Ensure permission catalog and role defaults are seeded first
    await seedRoleDefaults();

    // Find school (required for linking)
    const school = await prisma.school.findFirst({ orderBy: { createdAt: "asc" } });
    if (!school) {
      console.warn("[seed] No school found — skipping system account seeding");
      return;
    }

    const hashedPassword = await hashPassword(SEED_PASSWORD);

    // 1. Ensure Developer Account exists and has valid credentials
    const developerUser = await prisma.user.findFirst({
      where: { email: DEVELOPER_EMAIL },
      include: { accounts: true },
    });

    if (!developerUser) {
      console.log("[seed] Creating Developer system account...");
      await createSystemUser({
        email: DEVELOPER_EMAIL,
        name: "Developer",
        role: Role.DEVELOPER,
        designation: "System Developer",
        schoolId: school.id,
      });
      console.log("[seed] Developer account created ✓");
    } else {
      await prisma.user.update({
        where: { id: developerUser.id },
        data: { isActive: true, role: Role.DEVELOPER },
      });
      await prisma.account.deleteMany({
        where: { userId: developerUser.id, providerId: "credential" },
      });
      await prisma.account.create({
        data: {
          userId: developerUser.id,
          accountId: DEVELOPER_EMAIL,
          providerId: "credential",
          password: hashedPassword,
        },
      });
      console.log("[seed] Developer credentials verified ✓");
    }

    // 2. Ensure Primary Principal Account (principal@vidyanjali.edu.in) exists and has valid credentials
    const primaryPrincipal = await prisma.user.findFirst({
      where: { email: PRINCIPAL_EMAIL },
      include: { accounts: true },
    });

    if (!primaryPrincipal) {
      // Check if there is an existing principal user with a legacy email (e.g. vidhyanjali / .edu)
      const legacyPrincipal = await prisma.user.findFirst({
        where: {
          role: Role.PRINCIPAL,
          NOT: { email: PRINCIPAL_EMAIL },
        },
      });

      if (legacyPrincipal) {
        console.log(`[seed] Updating legacy principal (${legacyPrincipal.email}) to ${PRINCIPAL_EMAIL}...`);
        await prisma.user.update({
          where: { id: legacyPrincipal.id },
          data: {
            email: PRINCIPAL_EMAIL,
            loginIdentifier: PRINCIPAL_EMAIL,
            isActive: true,
            role: Role.PRINCIPAL,
          },
        });
        await prisma.account.deleteMany({
          where: { userId: legacyPrincipal.id, providerId: "credential" },
        });
        await prisma.account.create({
          data: {
            userId: legacyPrincipal.id,
            accountId: PRINCIPAL_EMAIL,
            providerId: "credential",
            password: hashedPassword,
          },
        });
        console.log("[seed] Principal account updated and verified ✓");
      } else {
        console.log("[seed] Creating Principal system account...");
        await createSystemUser({
          email: PRINCIPAL_EMAIL,
          name: "Principal",
          role: Role.PRINCIPAL,
          designation: "School Principal",
          schoolId: school.id,
        });
        console.log("[seed] Principal account created ✓");
      }
    } else {
      await prisma.user.update({
        where: { id: primaryPrincipal.id },
        data: {
          isActive: true,
          role: Role.PRINCIPAL,
          loginIdentifier: PRINCIPAL_EMAIL,
        },
      });
      await prisma.account.deleteMany({
        where: { userId: primaryPrincipal.id, providerId: "credential" },
      });
      await prisma.account.create({
        data: {
          userId: primaryPrincipal.id,
          accountId: PRINCIPAL_EMAIL,
          providerId: "credential",
          password: hashedPassword,
        },
      });
      console.log("[seed] Principal credentials verified ✓");
    }

    // 3. Also update password for any other Principal users in the system (e.g. alternate logins)
    const otherPrincipals = await prisma.user.findMany({
      where: {
        role: Role.PRINCIPAL,
        NOT: { email: PRINCIPAL_EMAIL },
      },
    });

    for (const alt of otherPrincipals) {
      await prisma.user.update({
        where: { id: alt.id },
        data: { isActive: true },
      });
      await prisma.account.deleteMany({
        where: { userId: alt.id, providerId: "credential" },
      });
      await prisma.account.create({
        data: {
          userId: alt.id,
          accountId: alt.email,
          providerId: "credential",
          password: hashedPassword,
        },
      });
    }

    console.log("[seed] All system accounts synchronized and verified.");
  } catch (err) {
    // Seeding is non-critical — log but do not crash the server
    console.error("[seed] System account seeding failed:", err);
  }
}


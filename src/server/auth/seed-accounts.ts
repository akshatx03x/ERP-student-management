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
const SEED_PIN = "0396";

async function createSystemUser(params: {
  email: string;
  name: string;
  role: Role;
  designation: string;
  schoolId: string;
}) {
  const { email, name, role, designation, schoolId } = params;
  const hashedPassword = await hashPassword(SEED_PASSWORD);
  const hashedPin = role === Role.PRINCIPAL ? await hashPassword(SEED_PIN) : null;
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
        username: role === Role.PRINCIPAL ? "Principal" : null,
        pinHash: hashedPin,
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
    const defaultPinHash = await hashPassword(SEED_PIN);

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
      if (developerUser.accounts.length === 0) {
        await prisma.account.create({
          data: {
            userId: developerUser.id,
            accountId: DEVELOPER_EMAIL,
            providerId: "credential",
            password: hashedPassword,
          },
        });
      }
      console.log("[seed] Developer credentials verified ✓");
    }

    // 2. Ensure Primary Principal Account exists and has valid credentials & username/PIN
    let primaryPrincipal = await prisma.user.findFirst({
      where: { email: PRINCIPAL_EMAIL },
      include: { accounts: true },
    });

    if (!primaryPrincipal) {
      primaryPrincipal = await prisma.user.findFirst({
        where: { role: Role.PRINCIPAL, username: "Principal" },
        include: { accounts: true },
      }) || await prisma.user.findFirst({
        where: { role: Role.PRINCIPAL },
        include: { accounts: true },
      });
    }

    if (!primaryPrincipal) {
      console.log("[seed] Creating Principal system account...");
      await createSystemUser({
        email: PRINCIPAL_EMAIL,
        name: "Principal",
        role: Role.PRINCIPAL,
        designation: "School Principal",
        schoolId: school.id,
      });
      console.log("[seed] Principal account created ✓");
    } else {
      const existingPrincipalUsernameOwner = await prisma.user.findFirst({
        where: { username: "Principal" },
      });
      const canSetUsername = !existingPrincipalUsernameOwner || existingPrincipalUsernameOwner.id === primaryPrincipal.id;

      await prisma.user.update({
        where: { id: primaryPrincipal.id },
        data: {
          isActive: true,
          role: Role.PRINCIPAL,
          ...(canSetUsername && !primaryPrincipal.username ? { username: "Principal" } : {}),
          ...(!primaryPrincipal.pinHash ? { pinHash: defaultPinHash } : {}),
        },
      });

      if (primaryPrincipal.accounts.length === 0) {
        await prisma.account.create({
          data: {
            userId: primaryPrincipal.id,
            accountId: primaryPrincipal.email,
            providerId: "credential",
            password: hashedPassword,
          },
        });
      }
      console.log("[seed] Principal credentials verified ✓");
    }

    console.log("[seed] All system accounts synchronized and verified.");
  } catch (err) {
    // Seeding is non-critical — log but do not crash the server
    console.error("[seed] System account seeding failed:", err);
  }
}


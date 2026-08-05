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

    // Check existence of both accounts
    const [developerUser, principalUser] = await Promise.all([
      prisma.user.findUnique({ where: { email: DEVELOPER_EMAIL } }),
      prisma.user.findUnique({ where: { email: PRINCIPAL_EMAIL } }),
    ]);

    const tasks: Promise<unknown>[] = [];

    if (!developerUser) {
      console.log("[seed] Creating Developer system account...");
      tasks.push(
        createSystemUser({
          email: DEVELOPER_EMAIL,
          name: "Developer",
          role: Role.DEVELOPER,
          designation: "System Developer",
          schoolId: school.id,
        }).then(() => console.log("[seed] Developer account created ✓")),
      );
    } else {
      console.log("[seed] Developer account already exists — skipping");
    }

    if (!principalUser) {
      console.log("[seed] Creating Principal system account...");
      tasks.push(
        createSystemUser({
          email: PRINCIPAL_EMAIL,
          name: "Principal",
          role: Role.PRINCIPAL,
          designation: "School Principal",
          schoolId: school.id,
        }).then(() => console.log("[seed] Principal account created ✓")),
      );
    } else {
      console.log("[seed] Principal account already exists — skipping");
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    } else {
      console.log("[seed] All system accounts already exist — nothing to do");
    }
  } catch (err) {
    // Seeding is non-critical — log but do not crash the server
    console.error("[seed] System account seeding failed:", err);
  }
}

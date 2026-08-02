try {
  require("dotenv").config();
} catch (e) {
  // dotenv is not installed in the packaged production environment;
  // fallback to pre-injected environment variables from process.env.
}
import { PrismaClient, Role } from "@prisma/client";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  ROLE_DEFAULT_PERMISSIONS,
  permissionKey,
  type PermissionKey,
} from "../src/config/permissions";

async function hashPasswordSecurely(password: string): Promise<string> {
  // If the password is the default one, return the pre-computed hash directly.
  // This avoids requiring 'better-auth/crypto' at all in standard desktop production.
  if (password === "Principal@123") {
    return "44dc4966f1e18bfbe83c2c8e07c7b8cd:8e218be9b41ea69c7a6c08620fe70bc183a011d37c2fbc616526973242618be11128263ebdb12ff67d611bbb053bada27d15f8864e077dcb9784c8092f4c528b";
  }
  
  try {
    const { hashPassword } = require("better-auth/crypto");
    return await hashPassword(password);
  } catch (e) {
    // If better-auth is not installed/packaged (e.g. standalone production) but the password was changed,
    // fallback to a default hash to avoid crashing the seed process.
    console.warn("[Seed] better-auth/crypto module not found. Falling back to default pre-computed hash.");
    return "44dc4966f1e18bfbe83c2c8e07c7b8cd:8e218be9b41ea69c7a6c08620fe70bc183a011d37c2fbc616526973242618be11128263ebdb12ff67d611bbb053bada27d15f8864e077dcb9784c8092f4c528b";
  }
}

const prisma = new PrismaClient();

async function seedPermissions() {
  for (const resource of PERMISSION_RESOURCES) {
    for (const action of PERMISSION_ACTIONS) {
      const key = permissionKey(resource, action);  
      await prisma.permission.upsert({
        where: { key },
        create: {
          resource,
          action,
          key,
          description: `${action} ${resource}`,
        },
        update: {},
      });
    }
  }

  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((p) => [p.key, p]));

  for (const [role, keys] of Object.entries(ROLE_DEFAULT_PERMISSIONS) as [
    "ACCOUNTANT" | "TEACHER" | "STUDENT",
    PermissionKey[],
  ][]) {
    for (const key of keys) {
      const permission = byKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId: permission.id } },
        create: { role, permissionId: permission.id, allowed: true },
        update: { allowed: true },
      });
    }
  }
}

async function main() {
  await seedPermissions();

  const school = await prisma.school.upsert({
    where: { code: "VPS" },
    create: {
      name: "Vidyanjali Public School",
      code: "VPS",
      branding: {
        create: {
          schoolName: "Vidyanjali Public School",
          address: "",
          phone: "",
          email: process.env.SEED_PRINCIPAL_EMAIL ?? "principal@vidyanjali.edu",
          website: "",
          principalName: process.env.SEED_PRINCIPAL_NAME ?? "Principal",
          receiptFooter: "Thank you for your payment.",
          reportCardFooter: "This is a computer-generated report card.",
        },
      },
    },
    update: {
      name: "Vidyanjali Public School",
    },
    include: { branding: true },
  });

  if (!school.branding) {
    await prisma.schoolBranding.create({
      data: {
        schoolId: school.id,
        schoolName: "Vidyanjali Public School",
        principalName: process.env.SEED_PRINCIPAL_NAME ?? "Principal",
        email: process.env.SEED_PRINCIPAL_EMAIL,
        receiptFooter: "Thank you for your payment.",
        reportCardFooter: "This is a computer-generated report card.",
      },
    });
  }

  const email = process.env.SEED_PRINCIPAL_EMAIL ?? "principal@vidyanjali.edu";
  const password = process.env.SEED_PRINCIPAL_PASSWORD ?? "Principal@123";
  const name = process.env.SEED_PRINCIPAL_NAME ?? "Principal";

  let staff = await prisma.staffProfile.findFirst({
    where: { schoolId: school.id, employeeCode: "PRINCIPAL-001" },
  });

  if (!staff) {
    staff = await prisma.staffProfile.create({
      data: {
        schoolId: school.id,
        employeeCode: "PRINCIPAL-001",
        fullName: name,
        designation: "Principal",
        role: Role.PRINCIPAL,
      },
    });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const hashed = await hashPasswordSecurely(password);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        emailVerified: true,
        role: Role.PRINCIPAL,
        isActive: true,
        mustChangePassword: false,
        schoolId: school.id,
        staffProfileId: staff.id,
        accounts: {
          create: {
            accountId: email,
            providerId: "credential",
            password: hashed,
          },
        },
      },
    });
    console.log(`Created principal user: ${user.email}`);
  } else {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: Role.PRINCIPAL,
        schoolId: school.id,
        staffProfileId: staff.id,
        isActive: true,
      },
    });
    console.log(`Principal already exists: ${email}`);
  }

  // Default grade scale
  const gradeCount = await prisma.gradeScale.count({ where: { schoolId: school.id } });
  if (gradeCount === 0) {
    await prisma.gradeScale.createMany({
      data: [
        { schoolId: school.id, minPercent: 90, maxPercent: 100, grade: "A+", remarks: "Outstanding" },
        { schoolId: school.id, minPercent: 80, maxPercent: 89.99, grade: "A", remarks: "Excellent" },
        { schoolId: school.id, minPercent: 70, maxPercent: 79.99, grade: "B+", remarks: "Very Good" },
        { schoolId: school.id, minPercent: 60, maxPercent: 69.99, grade: "B", remarks: "Good" },
        { schoolId: school.id, minPercent: 50, maxPercent: 59.99, grade: "C", remarks: "Satisfactory" },
        { schoolId: school.id, minPercent: 40, maxPercent: 49.99, grade: "D", remarks: "Needs Improvement" },
        { schoolId: school.id, minPercent: 0, maxPercent: 39.99, grade: "E", remarks: "Fail" },
      ],
    });
  }

  // Future notification channel stubs
  for (const type of ["SMS", "WHATSAPP", "EMAIL"] as const) {
    await prisma.notificationChannel.upsert({
      where: { schoolId_type: { schoolId: school.id, type } },
      create: { schoolId: school.id, type, enabled: false },
      update: {},
    });
  }

  console.log("Seed completed for Vidyanjali Public School");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

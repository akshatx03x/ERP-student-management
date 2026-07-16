import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";

async function attachNewUserToSchool(userId: string, name: string) {
  const school = await prisma.school.findFirst({ orderBy: { createdAt: "asc" } });
  if (!school) return;

  const staff = await prisma.staffProfile.create({
    data: {
      schoolId: school.id,
      employeeCode: `USR-${userId.slice(-6).toUpperCase()}`,
      fullName: name,
      designation: "Staff",
      role: Role.PRINCIPAL,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      role: Role.PRINCIPAL,
      isActive: true,
      mustChangePassword: false,
      schoolId: school.id,
      staffProfileId: staff.id,
    },
  });
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "PRINCIPAL",
        input: false,
      },
      isActive: {
        type: "boolean",
        required: true,
        defaultValue: true,
        input: false,
      },
      mustChangePassword: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: false,
      },
      loginIdentifier: {
        type: "string",
        required: false,
        input: false,
      },
      schoolId: {
        type: "string",
        required: false,
        input: false,
      },
      staffProfileId: {
        type: "string",
        required: false,
        input: false,
      },
      studentId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await attachNewUserToSchool(user.id, user.name);
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

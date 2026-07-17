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

// In-memory thread-safe secondary storage adapter to prevent database hits for active sessions.
// Re-uses globalThis to survive HMR resets in development mode.
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const globalAny = globalThis as any;
if (!globalAny.__betterAuthMemoryStorage) {
  globalAny.__betterAuthMemoryStorage = new Map<string, { value: string; expiresAt: number }>();
}
const storage = globalAny.__betterAuthMemoryStorage;

const memorySecondaryStorage = {
  get: async (key: string): Promise<string | null> => {
    const item = storage.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      storage.delete(key);
      return null;
    }
    return item.value;
  },
  set: async (key: string, value: string, ttl?: number): Promise<void> => {
    const expiresAt = ttl ? Date.now() + ttl * 1000 : Date.now() + 1000 * 60 * 60 * 24 * 7;
    storage.set(key, { value, expiresAt });
  },
  delete: async (key: string): Promise<void> => {
    storage.delete(key);
  },
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secondaryStorage: memorySecondaryStorage,
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
    disableSessionRefresh: true, // Prevents database writes on GET session requests
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  plugins: [nextCookies()],
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ],
});

export type Session = typeof auth.$Infer.Session;

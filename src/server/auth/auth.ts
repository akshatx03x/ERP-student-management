import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/server/lib/prisma";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000",
  database: prismaAdapter(prisma, {
    provider: "sqlite",
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
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    disableSessionRefresh: true,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  rateLimit: {
    enabled: false,
  },
  plugins: [nextCookies()],
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
    process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ],
});

export type Session = typeof auth.$Infer.Session;

// Non-blocking startup seed — runs once when the module is first loaded.
// Idempotent: safe to call on every cold start; no-op if accounts already exist.
import("@/server/auth/seed-accounts").then(({ seedSystemAccounts }) => {
  seedSystemAccounts().catch(() => {});
});


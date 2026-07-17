import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/lib/prisma";

/**
 * Cached per-request session fetch.
 * React cache() deduplicates this across the layout + page + any server
 * component that calls it within the same request — zero extra DB hits.
 */
export const getSession = cache(async function getSession() {
  const t0 = process.env.NODE_ENV === "development" ? performance.now() : 0;
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (process.env.NODE_ENV === "development") {
    console.log(`[perf] getSession: ${(performance.now() - t0).toFixed(1)}ms`);
  }
  return session;
});

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.isActive === false) {
    redirect("/login?error=inactive");
  }
  return session;
}

/**
 * Cached per-request full user fetch.
 * Includes all relations needed by layouts, pages and services — fetched once
 * and shared across every caller in the same request.
 */
export const getCurrentUser = cache(async function getCurrentUser() {
  const t0 = process.env.NODE_ENV === "development" ? performance.now() : 0;
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      staffProfile: true,
      student: {
        include: {
          family: true,
          enrollments: {
            include: { class: true, section: true, session: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
      school: { include: { branding: true } },
    },
  });
  if (process.env.NODE_ENV === "development") {
    console.log(`[perf] getCurrentUser: ${(performance.now() - t0).toFixed(1)}ms`);
  }
  if (!user || !user.isActive) {
    redirect("/login?error=inactive");
  }
  return user;
});

export type AppUser = Awaited<ReturnType<typeof getCurrentUser>>;

export function isPrincipal(role: Role) {
  return role === "PRINCIPAL";
}

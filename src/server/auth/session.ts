import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/lib/prisma";

export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

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

export async function getCurrentUser() {
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
  if (!user || !user.isActive) {
    redirect("/login?error=inactive");
  }
  return user;
}

export type AppUser = Awaited<ReturnType<typeof getCurrentUser>>;

export function isPrincipal(role: Role) {
  return role === "PRINCIPAL";
}

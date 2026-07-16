import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { resolveEffectivePermissions } from "@/server/permissions/guard";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { prisma } from "@/server/lib/prisma";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  const permissions = await resolveEffectivePermissions(user.id, user.role);
  const allowedResources = [
    ...new Set([...permissions].map((key) => key.split(".")[0])),
  ];

  const branding = user.schoolId
    ? await prisma.schoolBranding.findUnique({ where: { schoolId: user.schoolId } })
    : null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        schoolName={branding?.schoolName ?? user.school?.name ?? "School ERP"}
        allowedResources={allowedResources}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header userName={user.name} role={user.role} />
        <main className="flex-1 overflow-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

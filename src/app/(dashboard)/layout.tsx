import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { resolveEffectivePermissions } from "@/server/permissions/guard";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t0 = process.env.NODE_ENV === "development" ? performance.now() : 0;

  // cache()-wrapped — this result is shared with the page and any services
  // that also call getCurrentUser() within this same request.
  const user = await getCurrentUser();

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  // cache()-wrapped — shared with requirePermission() calls in pages/services.
  const permissions = await resolveEffectivePermissions(user.id, user.role);
  const allowedResources = [
    ...new Set([...permissions].map((key) => key.split(".")[0])),
  ];

  // Branding is already included via getCurrentUser → school: { include: { branding: true } }
  // No extra DB query needed.
  const branding = user.school?.branding;

  if (process.env.NODE_ENV === "development") {
    console.log(`[perf] DashboardLayout total: ${(performance.now() - t0).toFixed(1)}ms`);
  }

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

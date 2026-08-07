import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { resolveEffectivePermissions } from "@/server/permissions/guard";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import NextTopLoader from "nextjs-toploader";
import { AlertCircle } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const _t0 = process.env.NODE_ENV === "development" ? performance.now() : 0;

  // cache()-wrapped — this result is shared with the page and any services
  // that also call getCurrentUser() within this same request.
  const user = await getCurrentUser();

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  // cache()-wrapped — shared with requirePermission() calls in pages/services.
  // For PRINCIPAL: zero DB queries (computed from constants).
  const permissions = await resolveEffectivePermissions(user.id, user.role);
  const allowedResources = [
    ...new Set([...permissions].map((key) => key.split(".")[0])),
  ];

  // Branding is fetched from the cache on the user object getter.
  const school = await user.school;
  const branding = school?.branding;

  if (process.env.NODE_ENV === "development") {
    console.log(`[perf] DashboardLayout: ${(performance.now() - _t0).toFixed(1)}ms`);
  }

  const isSchoolLinked = user.schoolId && user.schoolId.trim() !== "";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <NextTopLoader color="#4f46e5" showSpinner={false} />
      <Sidebar
        schoolName={branding?.schoolName ?? school?.name ?? "School ERP"}
        allowedResources={allowedResources}
      />
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <Header userName={user.name} role={user.role} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {isSchoolLinked ? (
            children
          ) : (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="max-w-md w-full rounded-xl border border-amber-200 bg-amber-50 p-8 shadow-sm text-center space-y-4">
                <div className="flex justify-center">
                  <AlertCircle className="h-12 w-12 text-amber-500" />
                </div>
                <h1 className="text-xl font-bold text-amber-900">Account Not Linked to a School</h1>
                <p className="text-sm text-amber-800">
                  Your account <span className="font-semibold">{user.email}</span> is not linked to any school.
                </p>
                <p className="text-sm text-amber-700">
                  Please sign out and log in with the <strong>Principal account</strong> created during setup:
                </p>
                <div className="rounded-lg bg-white border border-amber-200 p-4 text-left text-sm font-mono space-y-1">
                  <p><span className="text-slate-500">Email:</span> <span className="font-semibold text-slate-800">principal@vidyanjali.edu</span></p>
                  <p><span className="text-slate-500">Password:</span> <span className="font-semibold text-slate-800">Principal@123</span></p>
                </div>
                <p className="text-xs text-amber-600">
                  If you changed these credentials, check your setup configuration.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

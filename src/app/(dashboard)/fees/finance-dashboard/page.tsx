import { requirePermission } from "@/server/permissions/guard";
import { getPrincipalFinanceDashboardDynamic } from "@/server/services/financial-reports.service";
import { FinanceDashboardClient } from "./finance-dashboard-client";
import { PageHeader } from "@/components/shared/states";

export default async function DynamicFinanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    sessionId?: string;
    month?: string;
    classId?: string;
    sectionId?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  await requirePermission("fee.view");

  const sp = await searchParams;

  const filters = {
    sessionId: sp.sessionId,
    month: sp.month,
    classId: sp.classId,
    sectionId: sp.sectionId,
    startDate: sp.startDate ? new Date(sp.startDate) : undefined,
    endDate: sp.endDate ? new Date(sp.endDate) : undefined,
  };

  const dashboardData = await getPrincipalFinanceDashboardDynamic(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="Principal Executive Finance Dashboard"
          description="High-level financial KPIs, class-level collections summary, dynamic analytics and drill-downs"
        />
      </div>
      <FinanceDashboardClient initialData={dashboardData as any} />
    </div>
  );
}

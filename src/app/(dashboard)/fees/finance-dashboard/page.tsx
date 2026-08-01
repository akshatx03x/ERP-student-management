import { requirePermission } from "@/server/permissions/guard";
import { getPrincipalFinanceDashboardDynamic } from "@/server/services/financial-reports.service";
import { FinanceDashboardClient } from "./finance-dashboard-client";
import { PageHeader } from "@/components/shared/states";

export default async function DynamicFinanceDashboardPage({
  searchParams,
}: {
  searchParams: {
    sessionId?: string;
    month?: string;
    classId?: string;
    sectionId?: string;
    startDate?: string;
    endDate?: string;
  };
}) {
  await requirePermission("fee.view");

  const filters = {
    sessionId: searchParams.sessionId,
    month: searchParams.month,
    classId: searchParams.classId,
    sectionId: searchParams.sectionId,
    startDate: searchParams.startDate ? new Date(searchParams.startDate) : undefined,
    endDate: searchParams.endDate ? new Date(searchParams.endDate) : undefined,
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

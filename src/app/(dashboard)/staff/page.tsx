import { listStaff } from "@/server/services/staff.service";
import { PageHeader } from "@/components/shared/states";
import { StaffClient } from "./staff-client";

export default async function StaffPage() {
  const staff = await listStaff({ pageSize: 100 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Directory"
        description="Manage school teachers, accountants, and login credentials."
      />
      <StaffClient initialStaff={staff.items} />
    </div>
  );
}

import { listLeaveRequests } from "@/server/services/leave.service";
import { listStudents } from "@/server/services/student.service";
import { PageHeader } from "@/components/shared/states";
import { LeaveClient } from "./leave-client";

export default async function LeavePage() {
  const [leaves, students] = await Promise.all([
    listLeaveRequests({ pageSize: 50 }),
    listStudents({ pageSize: 200 }),
  ]);

  return (
    <div>
      <PageHeader title="Leave" description="Leave requests, approval, and history." />
      <LeaveClient
        leaves={leaves.items}
        students={students.items.map((s) => ({ id: s.id, fullName: s.fullName }))}
      />
    </div>
  );
}

import { requirePermission } from "@/server/permissions/guard";
import { getStudentPortalFees } from "@/server/services/fee.service";
import { listStudents } from "@/server/services/student.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { StudentFeesPortal } from "./student-fees-portal";
import { FeeCollectionClient } from "./fee-collection-client";

export default async function FeeCollectionPage() {
  const { user } = await requirePermission("fee.view");

  if (user.role === "STUDENT") {
    const portal = await getStudentPortalFees();
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-stone-900">My Fees</h1>
          <p className="text-sm text-stone-500 mt-0.5">Your fee structure, balance, and payment history</p>
        </div>
        <StudentFeesPortal data={portal} />
      </div>
    );
  }

  const [students, sessions, current] = await Promise.all([
    listStudents({ pageSize: 500 }),
    listSessions({ pageSize: 20 }),
    getCurrentSession(),
  ]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-stone-900">Fee Collection</h1>
        <p className="text-sm text-stone-500 mt-0.5">Cashier workstation — search student, view outstanding months, collect payment</p>
      </div>
      <FeeCollectionClient
        students={students.items.map((s: any) => ({
          id: s.id,
          fullName: s.fullName,
          admissionNo: s.admissionNo,
          familyId: s.familyId,
          fatherName: s.family?.fatherName ?? null,
          classLabel: s.enrollments?.[0] ? `${s.enrollments[0].class.name}-${s.enrollments[0].section.name}` : null,
          primaryPhone: s.family?.primaryPhone ?? null,
        }))}
        sessions={sessions.items}
        currentSessionId={current?.id ?? null}
      />
    </div>
  );
}

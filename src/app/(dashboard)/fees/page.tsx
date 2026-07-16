import { requirePermission } from "@/server/permissions/guard";
import {
  listFeeHeads,
  listStudentFees,
  listPayments,
  listFeeStructures,
  getStudentPortalFees,
} from "@/server/services/fee.service";
import { listFamilies } from "@/server/services/family.service";
import { listStudents } from "@/server/services/student.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { listClasses } from "@/server/services/class.service";
import { PageHeader } from "@/components/shared/states";
import { FeesClient } from "./fees-client";
import { StudentFeesPortal } from "./student-fees-portal";

export default async function FeesPage() {
  const { user } = await requirePermission("fee.view");

  if (user.role === "STUDENT") {
    const portal = await getStudentPortalFees();
    return (
      <div>
        <PageHeader
          title="My Fees"
          description="Your class fee structure, balance, and payment history"
        />
        <StudentFeesPortal data={portal} />
      </div>
    );
  }

  const [heads, fees, payments, families, students, sessions, current, classes, structures] =
    await Promise.all([
      listFeeHeads(),
      listStudentFees({ pageSize: 200 }),
      listPayments({ pageSize: 50 }),
      listFamilies({ pageSize: 100 }),
      listStudents({ pageSize: 200 }),
      listSessions({ pageSize: 20 }),
      getCurrentSession(),
      listClasses({ pageSize: 50 }),
      listFeeStructures(),
    ]);

  return (
    <div>
      <PageHeader
        title="Fees"
        description="Class fee structures · automatic student ledgers · family payments with sibling allocation"
      />
      <FeesClient
        heads={heads}
        fees={fees.items}
        payments={payments.items}
        families={families.items}
        students={students.items.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          admissionNo: s.admissionNo,
          familyId: s.familyId,
        }))}
        sessions={sessions.items}
        currentSessionId={current?.id ?? null}
        classes={classes.items}
        structures={structures}
      />
    </div>
  );
}

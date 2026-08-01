import { requirePermission } from "@/server/permissions/guard";
import { listSessions, getCurrentSession } from "@/server/services/session.service";
import { listClasses } from "@/server/services/class.service";
import { listFeeHeads } from "@/server/services/fee.service";
import { ClassWiseStatusClient } from "./class-wise-status-client";
import { PageHeader } from "@/components/shared/states";

export default async function ClassWiseStatusPage() {
  await requirePermission("fee.view");

  const [sessions, currentSession, classes, heads] = await Promise.all([
    listSessions({ pageSize: 50 }),
    getCurrentSession(),
    listClasses({ pageSize: 100 }),
    listFeeHeads(),
  ]);

  const metaData = {
    sessions: sessions.items,
    classes: classes.items.map((c: any) => ({
      id: c.id,
      name: c.name,
      sections: c.sections.map((s: any) => ({ id: s.id, name: s.name })),
    })),
    feeHeads: heads.map((h: any) => ({ id: h.id, name: h.name })),
    activeSessionId: currentSession?.id ?? "",
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-4">
      <div className="mb-4">
        <PageHeader
          title="Class Wise Fee Status"
          description="Operational workspace to inspect individual class fee records, monthly ledgers, payment statuses and dues"
        />
      </div>
      <ClassWiseStatusClient metaData={metaData} />
    </div>
  );
}

import { requirePermission } from "@/server/permissions/guard";
import { listSessions, getCurrentSession } from "@/server/services/session.service";
import { listClasses } from "@/server/services/class.service";
import { listFeeHeads, listFeeStructures } from "@/server/services/fee.service";
import { listFeeLateRules } from "@/server/services/fine.service";
import { FeeSetupClient } from "./fee-setup-client";

export default async function FeeSetupPage() {
  await requirePermission("fee.view");

  const [sessions, currentSession, classes, heads, structures, rules] = await Promise.all([
    listSessions({ pageSize: 50 }),
    getCurrentSession(),
    listClasses({ pageSize: 100 }),
    listFeeHeads(),
    listFeeStructures(),
    listFeeLateRules({ page: 1, pageSize: 100 }),
  ]);

  return (
    <div className="max-w-[1440px] mx-auto space-y-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-stone-900">Fee Setup</h1>
        <p className="text-sm text-stone-500 mt-0.5">Configure Fee Heads, Document-like Class Fee Structures, and Late Fee rules</p>
      </div>
      <FeeSetupClient
        sessions={sessions.items}
        currentSessionId={currentSession?.id ?? null}
        classes={classes.items}
        heads={heads}
        structures={structures}
        rules={rules.items}
      />
    </div>
  );
}

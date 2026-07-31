import { prisma } from "@/server/lib/prisma";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { requirePermission } from "@/server/permissions/guard";
import { listSessions } from "@/server/services/session.service";
import { listClasses } from "@/server/services/class.service";
import { PageHeader } from "@/components/shared/states";
import { PromotionClient } from "./promotion-client";

export default async function PromotionPage() {
  const { user } = await requirePermission("session.update");
  const schoolId = schoolIdFromUser(user);

  const [sessionsRes, classesRes] = await Promise.all([
    listSessions({ pageSize: 50 }),
    listClasses({ pageSize: 100 }),
  ]);

  let promotionBatches: any[] = [];
  try {
    promotionBatches = await prisma.promotionBatch.findMany({
      where: { fromSession: { schoolId } },
      include: {
        fromSession: { select: { id: true, name: true, status: true } },
        toSession: { select: { id: true, name: true, status: true } },
        createdBy: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.error("Error loading promotion batches:", err);
    promotionBatches = [];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Academic Promotion"
        description="Bulk promote students class-wise from one academic session to another with full audit trail and rollback safety."
      />
      <PromotionClient
        sessions={JSON.parse(JSON.stringify(sessionsRes.items))}
        classes={JSON.parse(JSON.stringify(classesRes.items))}
        promotionBatches={JSON.parse(JSON.stringify(promotionBatches))}
      />
    </div>
  );
}

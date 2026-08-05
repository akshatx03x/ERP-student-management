import { prisma } from "@/server/lib/prisma";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { requirePermission } from "@/server/permissions/guard";
import { PageHeader } from "@/components/shared/states";
import { TCClient } from "./tc-client";

export default async function TCPage() {
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);

  const [sessions, classes] = await Promise.all([
    prisma.academicSession.findMany({
      where: { schoolId },
      orderBy: { startDate: "desc" },
    }),
    prisma.class.findMany({
      where: { schoolId },
      include: { sections: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const mappedSessions = sessions.map(s => ({
    id: s.id,
    name: s.name,
    isCurrent: s.isCurrent,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfer Certificate (TC) Management"
        description="Search students, generate draft/official Transfer Certificates, preview, download high-quality PDFs, and view register history."
      />
      <TCClient
        sessions={mappedSessions}
        classes={classes}
      />
    </div>
  );
}

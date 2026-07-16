import { listSessions, getCurrentSession } from "@/server/services/session.service";
import { PageHeader, EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { AcademicsClient } from "./academics-client";

export default async function AcademicsPage() {
  const [{ items }, current] = await Promise.all([
    listSessions({ pageSize: 50 }),
    getCurrentSession(),
  ]);

  return (
    <div>
      <PageHeader
        title="Academic Sessions"
        description="Create, switch, close, and archive sessions. Promote students between sessions."
      />
      <AcademicsClient sessions={items} currentSessionId={current?.id ?? null} />
      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No academic sessions"
            description="Create your first session to start enrolling students."
          />
        </div>
      ) : null}
      {current ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Current session: <Badge variant="success">{current.name}</Badge> ·{" "}
          {formatDate(current.startDate)} – {formatDate(current.endDate)}
        </p>
      ) : null}
    </div>
  );
}

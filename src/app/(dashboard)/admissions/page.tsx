import { listAdmissions } from "@/server/services/admission.service";
import { listClasses } from "@/server/services/class.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { PageHeader } from "@/components/shared/states";
import { AdmissionsClient } from "./admissions-client";

export default async function AdmissionsPage() {
  const [admissions, classes, sessions, current] = await Promise.all([
    listAdmissions({ pageSize: 50 }),
    listClasses({ pageSize: 50 }),
    listSessions({ pageSize: 20 }),
    getCurrentSession(),
  ]);

  return (
    <div>
      <PageHeader
        title="Admissions"
        description="Enter student and parent details. The system links or creates the family automatically. Approve to assign an admission number."
      />
      <AdmissionsClient
        admissions={admissions.items}
        classes={classes.items}
        sessions={sessions.items}
        currentSessionId={current?.id ?? null}
      />
    </div>
  );
}

import { listClasses } from "@/server/services/class.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { PageHeader } from "@/components/shared/states";
import { NewStudentForm } from "./new-student-form";

export default async function NewStudentPage() {
  const [classes, sessions, current] = await Promise.all([
    listClasses({ pageSize: 100 }),
    listSessions({ pageSize: 50 }),
    getCurrentSession(),
  ]);

  return (
    <div>
      <PageHeader
        title="Add student"
        description="Enter student and parent details together. No need to create a family first."
      />
      <NewStudentForm
        classes={classes.items}
        sessions={sessions.items}
        currentSessionId={current?.id ?? null}
      />
    </div>
  );
}

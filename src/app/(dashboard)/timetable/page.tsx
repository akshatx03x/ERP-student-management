import { listClasses, listSubjects } from "@/server/services/class.service";
import { listStaff } from "@/server/services/staff.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { PageHeader } from "@/components/shared/states";
import { TimetableClient } from "./timetable-client";

export default async function TimetablePage() {
  const [classes, subjects, staff, sessions, current] = await Promise.all([
    listClasses({ pageSize: 50 }),
    listSubjects({ pageSize: 100 }),
    listStaff({ role: "TEACHER", pageSize: 100 }),
    listSessions({ pageSize: 20 }),
    getCurrentSession(),
  ]);

  return (
    <div>
      <PageHeader title="Timetable" description="Class and teacher timetable slots." />
      <TimetableClient
        classes={classes.items}
        subjects={subjects.items}
        teachers={staff.items}
        sessions={sessions.items}
        currentSessionId={current?.id ?? null}
      />
    </div>
  );
}

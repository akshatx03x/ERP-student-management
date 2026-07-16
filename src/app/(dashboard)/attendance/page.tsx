import { listClasses } from "@/server/services/class.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { PageHeader } from "@/components/shared/states";
import { AttendanceClient } from "./attendance-client";

export default async function AttendancePage() {
  const [classes, sessions, current] = await Promise.all([
    listClasses({ pageSize: 50 }),
    listSessions({ pageSize: 20 }),
    getCurrentSession(),
  ]);

  return (
    <div>
      <PageHeader title="Attendance" description="Mark daily attendance by section. Holidays are considered in monthly reports." />
      <AttendanceClient
        classes={classes.items}
        sessions={sessions.items}
        currentSessionId={current?.id ?? null}
      />
    </div>
  );
}

import { listHomework } from "@/server/services/homework.service";
import { listClasses, listSubjects } from "@/server/services/class.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { PageHeader } from "@/components/shared/states";
import { HomeworkClient } from "./homework-client";

export default async function HomeworkPage() {
  const [homework, classes, subjects, sessions, current] = await Promise.all([
    listHomework({ pageSize: 50 }),
    listClasses({ pageSize: 50 }),
    listSubjects({ pageSize: 100 }),
    listSessions({ pageSize: 20 }),
    getCurrentSession(),
  ]);

  return (
    <div>
      <PageHeader title="Homework" description="Assign homework with due dates. Attachments via Documents module." />
      <HomeworkClient
        homework={homework.items}
        classes={classes.items}
        subjects={subjects.items}
        sessions={sessions.items}
        currentSessionId={current?.id ?? null}
      />
    </div>
  );
}

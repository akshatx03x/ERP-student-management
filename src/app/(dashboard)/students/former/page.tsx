import { listFormerStudents } from "@/server/services/student.service";
import { listSessions } from "@/server/services/session.service";
import { listClasses } from "@/server/services/class.service";
import { FormerStudentsClient } from "./former-students-client";
import { PageHeader } from "@/components/shared/states";

export default async function FormerStudentsPage() {
  const [result, sessionsResult, classesResult] = await Promise.all([
    listFormerStudents({ pageSize: 500 }),
    listSessions({ pageSize: 100 }),
    listClasses({ pageSize: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Former Students"
        description="View records and exit details of students who have left the school."
      />
      <FormerStudentsClient
        students={result.items}
        sessions={sessionsResult.items}
        classes={classesResult.items}
      />
    </div>
  );
}

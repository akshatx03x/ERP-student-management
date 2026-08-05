import { listRetainedStudents } from "@/server/services/student.service";
import { listSessions } from "@/server/services/session.service";
import { listClasses } from "@/server/services/class.service";
import { RetainedStudentsClient } from "./retained-students-client";
import { PageHeader } from "@/components/shared/states";

export default async function RetainedStudentsPage() {
  const [retainedResult, sessionsResult, classesResult] = await Promise.all([
    listRetainedStudents({ pageSize: 500 }),
    listSessions({ pageSize: 100 }),
    listClasses({ pageSize: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Retained Students"
        description="View and filter records of students who have been retained in the same class."
      />
      <RetainedStudentsClient
        students={retainedResult.items}
        sessions={sessionsResult.items}
        classes={classesResult.items}
      />
    </div>
  );
}

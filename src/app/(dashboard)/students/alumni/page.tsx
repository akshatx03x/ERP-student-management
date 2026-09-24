import { listAlumniStudents } from "@/server/services/student.service";
import { listSessions } from "@/server/services/session.service";
import { listClasses } from "@/server/services/class.service";
import { AlumniStudentsClient } from "./alumni-students-client";
import { PageHeader } from "@/components/shared/states";

export default async function AlumniPage() {
  const [alumniResult, sessionsResult, classesResult] = await Promise.all([
    listAlumniStudents({ pageSize: 500 }),
    listSessions({ pageSize: 100 }),
    listClasses({ pageSize: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Alumni"
        description="Directory of graduated students and their complete academic history."
      />
      <AlumniStudentsClient
        students={alumniResult.items}
        sessions={sessionsResult.items}
        classes={classesResult.items}
      />
    </div>
  );
}

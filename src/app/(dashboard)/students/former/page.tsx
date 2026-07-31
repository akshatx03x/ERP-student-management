import { listFormerStudents } from "@/server/services/student.service";
import { FormerStudentsClient } from "./former-students-client";
import { PageHeader } from "@/components/shared/states";

export default async function FormerStudentsPage() {
  const result = await listFormerStudents({ pageSize: 200 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Former Students"
        description="View records and exit details of students who have left the school."
      />
      <FormerStudentsClient students={result.items} />
    </div>
  );
}

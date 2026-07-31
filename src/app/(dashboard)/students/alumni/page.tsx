import { listAlumniStudents } from "@/server/services/student.service";
import { AlumniStudentsClient } from "./alumni-students-client";
import { PageHeader } from "@/components/shared/states";

export default async function AlumniPage() {
  const result = await listAlumniStudents({ pageSize: 200 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Alumni"
        description="Directory of graduated students and their complete academic history."
      />
      <AlumniStudentsClient students={result.items} />
    </div>
  );
}

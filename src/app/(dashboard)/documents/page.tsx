import { listStudents } from "@/server/services/student.service";
import { PageHeader } from "@/components/shared/states";
import { DocumentsClient } from "./documents-client";

export default async function DocumentsPage() {
  const students = await listStudents({ pageSize: 100 });
  return (
    <div>
      <PageHeader title="Documents" description="Files stored in PostgreSQL (max 5MB). No cloud storage." />
      <DocumentsClient students={students.items.map((s) => ({ id: s.id, fullName: s.fullName }))} />
    </div>
  );
}

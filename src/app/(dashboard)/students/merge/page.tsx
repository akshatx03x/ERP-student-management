import { listStudents } from "@/server/services/student.service";
import { PageHeader } from "@/components/shared/states";
import { MergeSiblingsClient } from "./merge-siblings-client";

export default async function MergeSiblingsPage() {
  const students = await listStudents({ pageSize: 200 });

  return (
    <div>
      <PageHeader
        title="Merge siblings"
        description="Link multiple students to one parent when they were added separately by mistake."
      />
      <MergeSiblingsClient
        students={students.items.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          admissionNo: s.admissionNo,
          familyId: s.familyId,
          family: s.family
            ? {
                fatherName: s.family.fatherName,
                motherName: s.family.motherName,
                primaryPhone: s.family.primaryPhone,
              }
            : null,
        }))}
      />
    </div>
  );
}

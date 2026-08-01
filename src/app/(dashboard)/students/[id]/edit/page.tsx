import { getStudent } from "@/server/services/student.service";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/states";
import { EditStudentForm } from "../edit-student-form";
import Link from "next/link";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await getStudent(id).catch(() => null);

  if (!student) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-3">
        <PageHeader
          title="Edit Student Dossier"
          description={`Update details for ${student.fullName} (Adm. No: ${student.admissionNo})`}
        />
        <Link
          href={`/students/${student.id}`}
          className="text-xs font-bold text-stone-600 hover:text-stone-900 border border-stone-200 px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
        >
          Back to Dossier
        </Link>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
        <EditStudentForm
          student={{
            id: student.id,
            firstName: student.firstName,
            middleName: student.middleName,
            lastName: student.lastName,
            dateOfBirth: student.dateOfBirth,
            admissionDate: student.admissionDate,
            gender: student.gender,
            bloodGroup: student.bloodGroup,
            aadhaar: student.aadhaar,
            apaarId: student.apaarId,
            penId: student.penId,
            previousSchoolName: student.previousSchoolName,
            religion: student.religion,
            status: student.status,
          }}
          onCancel={() => {}}
          onSaved={() => {}}
        />
      </div>
    </div>
  );
}

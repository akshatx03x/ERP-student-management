import { getStudent } from "@/server/services/student.service";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/states";
import { EditStudentForm } from "../edit-student-form";
import { getStudentFormOptionsAction } from "@/server/actions/student.actions";
import Link from "next/link";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [student, options] = await Promise.all([
    getStudent(id).catch(() => null),
    getStudentFormOptionsAction().catch(() => ({ classes: { items: [] } })),
  ]);

  if (!student) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-3">
        <PageHeader
          title="Edit Student"
          description={`Update details for ${student.fullName} (Adm. No: ${student.admissionNo})`}
        />
        <Link
          href={`/students/${student.id}`}
          className="text-xs font-bold text-stone-600 hover:text-stone-900 border border-stone-200 px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
        >
          Back
        </Link>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
        <EditStudentForm
          classes={options.classes.items}
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
            photoUrl: student.photoUrl,
            srNo: student.srNo,
            primaryPhone: student.family?.primaryPhone,
            familyId: student.familyId,
            classId: student.enrollments[0]?.classId ?? "",
            sectionId: student.enrollments[0]?.sectionId ?? "",
            siblings: (student as any).siblings ?? [],
            tcNumber: student.tcNumber,
            exitReason: student.exitInfo?.reason,
          }}
        />
      </div>
    </div>
  );
}

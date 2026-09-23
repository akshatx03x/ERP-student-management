import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudent } from "@/server/services/student.service";
import { requirePermission } from "@/server/permissions/guard";
import { PageHeader } from "@/components/shared/states";
import { StudentProfileClient } from "@/components/student-profile/profile-client";
import { getStudentMarksData } from "@/server/services/result.service";
import { prisma } from "@/server/lib/prisma";
import { schoolIdFromUser } from "@/server/lib/helpers";

export default async function StudentDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string; returnTo?: string; returnLabel?: string }>;
}) {
  const { id } = await params;
  const { from, returnTo, returnLabel } = (await searchParams) || {};
  const { user } = await requirePermission("student.view");
  const schoolId = schoolIdFromUser(user);

  const student = await getStudent(id).catch(() => null);
  if (!student) notFound();

  // Fetch academic session and marks for the current session
  const currentSession = await prisma.academicSession.findFirst({
    where: { schoolId, isCurrent: true },
  });

  const marksData = currentSession
    ? await getStudentMarksData(student.id, currentSession.id).catch(() => null)
    : null;

  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (returnTo) query.set("returnTo", returnTo);
  if (returnLabel) query.set("returnLabel", returnLabel);
  const backToProfileHref = `/students/${student.id}${query.toString() ? `?${query.toString()}` : ""}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-3">
        <PageHeader
          title="Student Digital Profile"
          description={`Complete academic, family, and medical record for ${student.fullName}`}
        />
        <div className="flex gap-2">
          <Link
            href={backToProfileHref}
            className="text-xs font-bold text-stone-600 hover:text-stone-900 border border-stone-250 px-3.5 py-2 rounded-lg hover:bg-stone-50 transition-colors"
          >
            Back to Profile
          </Link>
        </div>
      </div>

      <StudentProfileClient student={student} marksData={marksData} />
    </div>
  );
}

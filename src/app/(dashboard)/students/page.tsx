import Link from "next/link";
import { listStudents } from "@/server/services/student.service";
import { listClasses } from "@/server/services/class.service";
import { PageHeader, EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StudentsClient } from "./students-client";
import { requirePermission, resolveEffectivePermissions } from "@/server/permissions/guard";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classId?: string; sectionId?: string }>;
}) {
  const params = await searchParams;
  const { user } = await requirePermission("student.view");
  const perms = await resolveEffectivePermissions(user.id, user.role);
  const canDelete = perms.has("student.delete");

  const [students, classes] = await Promise.all([
    listStudents({
      pageSize: 50,
      search: params.q,
      classId: params.classId,
      sectionId: params.sectionId,
    }),
    listClasses({ pageSize: 100 }),
  ]);

  return (
    <div>
      <PageHeader
        title="Students"
        description="Add a student with parent details together. Use Merge siblings when one parent has more than one child in school."
        actions={
          <>
            <Link
              href="/students/merge"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Merge siblings
            </Link>
            <Link href="/students/new" className={cn(buttonVariants())}>
              Add student
            </Link>
          </>
        }
      />
      <StudentsClient
        students={students.items}
        initialSearch={params.q ?? ""}
        canDelete={canDelete}
        currentUserStudentId={user.studentId ?? undefined}
        classes={classes.items}
        initialClassId={params.classId ?? ""}
        initialSectionId={params.sectionId ?? ""}
      />
      {students.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No students yet"
            description="Click Add student to enter student and parent details in one place."
          />
        </div>
      ) : null}
    </div>
  );
}

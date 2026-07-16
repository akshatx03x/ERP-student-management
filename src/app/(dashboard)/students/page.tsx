import Link from "next/link";
import { listStudents } from "@/server/services/student.service";
import { PageHeader, EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StudentsClient } from "./students-client";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const students = await listStudents({ pageSize: 50, search: params.q });

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
      <StudentsClient students={students.items} initialSearch={params.q ?? ""} />
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

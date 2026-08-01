import Link from "next/link";
import { listStudents } from "@/server/services/student.service";
import { listClasses } from "@/server/services/class.service";
import { listSessions, getCurrentSession } from "@/server/services/session.service";
import { PageHeader, EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StudentsClient } from "./students-client";
import { requirePermission, resolveEffectivePermissions } from "@/server/permissions/guard";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classId?: string; sectionId?: string; sessionId?: string }>;
}) {
  const params = await searchParams;
  const { user } = await requirePermission("student.view");
  const perms = await resolveEffectivePermissions(user.id, user.role);
  const canDelete = perms.has("student.delete");

  const [classes, sessionsResult, currentSession] = await Promise.all([
    listClasses({ pageSize: 100 }),
    listSessions({ pageSize: 100 }),
    getCurrentSession(),
  ]);

  const initialSessionId = params.sessionId ?? currentSession?.id ?? "";
  const initialClassId = params.classId ?? "";

  const students = (initialClassId || params.q?.trim())
    ? await listStudents({
        pageSize: 500, // Fetch up to 500 records to let Client scroll
        search: params.q,
        classId: (initialClassId && initialClassId !== "ALL") ? initialClassId : undefined,
        sectionId: params.sectionId || undefined,
        sessionId: initialSessionId || undefined,
      })
    : { items: [], total: 0 };

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
        initialClassId={initialClassId}
        initialSectionId={params.sectionId ?? ""}
        sessions={sessionsResult.items}
        initialSessionId={initialSessionId}
      />
    </div>
  );
}

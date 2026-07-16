import { listClasses, listSubjects } from "@/server/services/class.service";
import { getCurrentSession } from "@/server/services/session.service";
import { listStaff } from "@/server/services/staff.service";
import { PageHeader, EmptyState } from "@/components/shared/states";
import { ClassesClient } from "./classes-client";

export default async function ClassesPage() {
  const [classes, subjects, currentSession, staff] = await Promise.all([
    listClasses({ pageSize: 100 }),
    listSubjects({ pageSize: 100 }),
    getCurrentSession(),
    listStaff({ role: "TEACHER", pageSize: 100 }),
  ]);

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Manage classes, sections, subjects, and class teachers."
      />
      <ClassesClient
        classes={classes.items}
        subjects={subjects.items}
        teachers={staff.items}
        currentSessionId={currentSession?.id ?? null}
      />
      {classes.items.length === 0 && subjects.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No classes or subjects"
            description="Create a class and at least one section to place students."
          />
        </div>
      ) : null}
    </div>
  );
}

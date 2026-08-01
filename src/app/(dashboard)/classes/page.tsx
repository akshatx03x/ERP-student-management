import { listClasses } from "@/server/services/class.service";
import { PageHeader, EmptyState } from "@/components/shared/states";
import { ClassesClient } from "./classes-client";

export default async function ClassesPage() {
  const classes = await listClasses({ pageSize: 100 });

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Manage classes and sections."
      />
      <ClassesClient
        classes={classes.items}
      />
      {classes.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No classes"
            description="Create a class and at least one section to place students."
          />
        </div>
      ) : null}
    </div>
  );
}

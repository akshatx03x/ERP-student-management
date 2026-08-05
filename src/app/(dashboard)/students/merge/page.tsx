import { listClasses } from "@/server/services/class.service";
import { PageHeader } from "@/components/shared/states";
import { MergeSiblingsClient } from "./merge-siblings-client";

export default async function MergeSiblingsPage() {
  const classesResult = await listClasses({ pageSize: 100 }).catch(() => ({ items: [] }));

  return (
    <div>
      <PageHeader
        title="Merge siblings"
        description="Link multiple students to one parent when they were added separately by mistake."
      />
      <MergeSiblingsClient classes={classesResult.items} />
    </div>
  );
}

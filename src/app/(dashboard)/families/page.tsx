import { listFamilies } from "@/server/services/family.service";
import { PageHeader } from "@/components/shared/states";
import { FamiliesClient } from "./families-client";

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const data = await listFamilies({ pageSize: 50, search: params.q });

  return (
    <div>
      <PageHeader
        title="Families"
        description="Overview only — parents, linked students, and fee payments. Families are created when you add or admit a student."
      />
      <FamiliesClient families={data.items} initialSearch={params.q ?? ""} />
    </div>
  );
}

import { getSchoolBranding } from "@/server/services/branding.service";
import { listUsers, listPermissionCatalog, getUserPermissionOverrides } from "@/server/services/settings.service";
import { PageHeader } from "@/components/shared/states";
import { ImportPanel } from "@/components/shared/import-panel";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [branding, users, permissions] = await Promise.all([
    getSchoolBranding(),
    listUsers({ page: 1, pageSize: 50 }),
    listPermissionCatalog(),
  ]);

  const firstStaffUser = users.items.find(
    (u) => u.role === "ACCOUNTANT" || u.role === "TEACHER",
  );

  const overrides = firstStaffUser
    ? await getUserPermissionOverrides(firstStaffUser.id)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="School branding, users, permissions, and Excel import"
      />
      <ImportPanel />
      <SettingsClient
        branding={branding}
        users={users.items}
        permissions={permissions}
        initialOverrides={overrides.map((o) => ({
          userId: o.userId,
          permissionKey: o.permission.key,
          allowed: o.allowed,
        }))}
        initialSelectedUserId={firstStaffUser?.id ?? null}
      />
    </div>
  );
}

import { getSchoolBranding } from "@/server/services/branding.service";
import { listUsers } from "@/server/services/settings.service";
import { listStaff } from "@/server/services/staff.service";
import { PageHeader } from "@/components/shared/states";
import { ImportPanel } from "@/components/shared/import-panel";
import { BackupPanel } from "@/components/shared/backup-panel";
import { SettingsClient } from "./settings-client";
import { getCurrentUser, isPrincipal } from "@/server/auth/session";
import { PERMISSION_GROUPS, PERMISSION_PRESETS } from "@/config/permissions";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const isAdminView = isPrincipal(user.role) || user.role === "DEVELOPER";

  // Load last backup info (non-blocking)
  let lastBackup = null;
  if (isAdminView) {
    try {
      const { getBackupProvider } = await import("@/server/providers/backup.provider");
      const provider = getBackupProvider();
      const backups = await provider.listBackups();
      if (backups.length > 0) {
        const b = backups[0]!;
        lastBackup = {
          id: b.id,
          filename: b.filename,
          sizeBytes: b.sizeBytes,
          createdAt: b.createdAt.toISOString(),
          schoolName: b.schoolName,
          erpVersion: b.erpVersion,
          backupFormatVersion: b.backupFormatVersion,
          sha256: b.sha256,
          ...(b.label ? { label: b.label } : {}),
        };
      }
    } catch {
      // Non-critical
    }
  }

  const [branding, staff, usersData] = await Promise.all([
    getSchoolBranding(),
    listStaff({ pageSize: 100 }),
    isAdminView ? listUsers({ pageSize: 200 }) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 200 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="School branding, user accounts, permissions, and Excel import"
      />
      {isAdminView && (
        <BackupPanel isPrincipal={true} lastBackup={lastBackup} />
      )}
      <ImportPanel />
      <SettingsClient
        branding={branding}
        staffProfiles={staff.items.map((s: any) => ({
          id: s.id,
          employeeCode: s.employeeCode,
          fullName: s.fullName,
          phone: s.phone,
          designation: s.designation,
          role: s.role,
          isActive: s.isActive,
          user: s.user ? {
            id: s.user.id,
            email: s.user.email,
            isActive: s.user.isActive,
            loginIdentifier: s.user.loginIdentifier,
          } : null,
        }))}
        users={usersData.items}
        permissionGroups={PERMISSION_GROUPS}
        permissionPresets={PERMISSION_PRESETS}
        schoolId={branding.schoolId}
        isAdminView={isAdminView}
      />
    </div>
  );
}

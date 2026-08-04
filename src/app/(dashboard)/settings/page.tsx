import { getSchoolBranding } from "@/server/services/branding.service";
import { listPermissionCatalog, getUserPermissionOverrides } from "@/server/services/settings.service";
import { listStaff } from "@/server/services/staff.service";
import { PageHeader } from "@/components/shared/states";
import { ImportPanel } from "@/components/shared/import-panel";
import { BackupPanel } from "@/components/shared/backup-panel";
import { SettingsClient } from "./settings-client";
import { getCurrentUser } from "@/server/auth/session";
import { isPrincipal } from "@/server/auth/session";
import { getBackupProvider } from "@/server/providers/backup.provider";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const principalView = isPrincipal(user.role);

  // Load last backup info (non-blocking)
  let lastBackup = null;
  if (principalView) {
    try {
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

  const [branding, staff, permissions] = await Promise.all([
    getSchoolBranding(),
    listStaff({ pageSize: 100 }),
    listPermissionCatalog(),
  ]);

  const firstStaffUser = staff.items.find(
    (s: any) => s.user && (s.role === "ACCOUNTANT" || s.role === "TEACHER"),
  );

  const overrides = firstStaffUser?.user
    ? await getUserPermissionOverrides(firstStaffUser.user.id)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="School branding, user accounts, permissions, and Excel import"
      />
      {principalView && (
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
          } : null,
        }))}
        permissions={permissions}
        initialOverrides={overrides.map((o) => ({
          userId: o.userId,
          permissionKey: o.permission.key,
          allowed: o.allowed,
        }))}
        initialSelectedUserId={firstStaffUser?.user?.id ?? null}
        schoolId={branding.schoolId}
      />
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  updateBrandingAction,
  updatePermissionsAction,
  toggleUserActiveAction,
  getUserOverridesAction,
} from "@/server/actions/settings.actions";

type Branding = {
  schoolName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  principalName: string | null;
  receiptFooter: string | null;
  reportCardFooter: string | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  loginIdentifier: string | null;
};

type PermissionRow = {
  id: string;
  key: string;
  resource: string;
  action: string;
};

export function SettingsClient({
  branding,
  users,
  permissions,
  initialOverrides,
  initialSelectedUserId,
}: {
  branding: Branding;
  users: UserRow[];
  permissions: PermissionRow[];
  initialOverrides: Array<{ userId: string; permissionKey: string; allowed: boolean }>;
  initialSelectedUserId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    schoolName: branding.schoolName,
    address: branding.address ?? "",
    phone: branding.phone ?? "",
    email: branding.email ?? "",
    website: branding.website ?? "",
    principalName: branding.principalName ?? "",
    receiptFooter: branding.receiptFooter ?? "",
    reportCardFooter: branding.reportCardFooter ?? "",
  });

  const [selectedUserId, setSelectedUserId] = useState(initialSelectedUserId);
  const [overrideMap, setOverrideMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const o of initialOverrides) {
      if (o.userId === initialSelectedUserId) map[o.permissionKey] = o.allowed;
    }
    return map;
  });

  const selectableUsers = useMemo(
    () => users.filter((u) => u.role === "ACCOUNTANT" || u.role === "TEACHER"),
    [users],
  );

  function saveBranding() {
    startTransition(async () => {
      try {
        await updateBrandingAction({
          schoolName: form.schoolName,
          address: form.address || null,
          phone: form.phone || null,
          email: form.email.trim() ? form.email.trim() : null,
          website: form.website.trim() ? form.website.trim() : null,
          principalName: form.principalName || null,
          receiptFooter: form.receiptFooter || null,
          reportCardFooter: form.reportCardFooter || null,
        });
        toast.success("Branding saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save branding");
      }
    });
  }

  async function onSelectUser(userId: string) {
    setSelectedUserId(userId);
    try {
      const overrides = await getUserOverridesAction(userId);
      const map: Record<string, boolean> = {};
      for (const o of overrides) {
        map[o.permission.key] = o.allowed;
      }
      setOverrideMap(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load permissions");
    }
  }

  function savePermissions() {
    if (!selectedUserId) return;
    startTransition(async () => {
      try {
        const payload = Object.entries(overrideMap).map(([permissionKey, allowed]) => ({
          permissionKey,
          allowed,
        }));
        await updatePermissionsAction({ userId: selectedUserId, permissions: payload });
        toast.success("Permissions updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update permissions");
      }
    });
  }

  function toggleActive(userId: string, isActive: boolean) {
    startTransition(async () => {
      try {
        await toggleUserActiveAction({ userId, isActive });
        toast.success(isActive ? "User activated" : "User deactivated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update user");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>School branding</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>School name</Label>
            <Input
              value={form.schoolName}
              onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Principal name</Label>
            <Input
              value={form.principalName}
              onChange={(e) => setForm((f) => ({ ...f, principalName: e.target.value }))}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Address</Label>
            <Textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Receipt footer</Label>
            <Textarea
              value={form.receiptFooter}
              onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Report card footer</Label>
            <Textarea
              value={form.reportCardFooter}
              onChange={(e) => setForm((f) => ({ ...f, reportCardFooter: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <Button type="button" onClick={saveBranding} disabled={pending}>
              Save branding
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : (
            users.map((u) => (
              <div
                key={u.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.loginIdentifier || u.email} · {u.role}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={u.isActive ? "success" : "secondary"}>
                    {u.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || u.role === "PRINCIPAL"}
                    onClick={() => toggleActive(u.id, !u.isActive)}
                  >
                    {u.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permission overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Staff user</Label>
            <Select
              value={selectedUserId ?? ""}
              onChange={(e) => onSelectUser(e.target.value)}
            >
              <option value="" disabled>
                Select accountant or teacher
              </option>
              {selectableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </Select>
          </div>
          {selectedUserId ? (
            <>
              <div className="max-h-80 space-y-2 overflow-auto rounded-md border p-3">
                {permissions.map((p) => (
                  <label key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{p.key}</span>
                    <input
                      type="checkbox"
                      checked={overrideMap[p.key] ?? false}
                      onChange={(e) =>
                        setOverrideMap((m) => ({ ...m, [p.key]: e.target.checked }))
                      }
                    />
                  </label>
                ))}
              </div>
              <Button type="button" onClick={savePermissions} disabled={pending}>
                Save permissions
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Create an accountant or teacher account to manage permissions.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

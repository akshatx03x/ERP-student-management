"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  createStaffSettingsAction,
  updateStaffSettingsAction,
  deleteStaffSettingsAction,
  createStaffLoginSettingsAction,
} from "@/server/actions/settings.actions";
import { uploadDocumentAction } from "@/server/actions/platform.actions";

type Branding = {
  schoolName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  principalName: string | null;
  receiptFooter: string | null;
  reportCardFooter: string | null;
  logoDocumentId: string | null;
};

type StaffProfileRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  designation: string | null;
  role: string;
  isActive: boolean;
  user: {
    id: string;
    email: string;
    isActive: boolean;
  } | null;
};

type PermissionRow = {
  id: string;
  key: string;
  resource: string;
  action: string;
};

export function SettingsClient({
  branding,
  staffProfiles,
  permissions,
  initialOverrides,
  initialSelectedUserId,
  schoolId,
}: {
  branding: Branding;
  staffProfiles: StaffProfileRow[];
  permissions: PermissionRow[];
  initialOverrides: Array<{ userId: string; permissionKey: string; allowed: boolean }>;
  initialSelectedUserId: string | null;
  schoolId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Branding Form State
  const [form, setForm] = useState({
    schoolName: branding.schoolName,
    address: branding.address ?? "",
    phone: branding.phone ?? "",
    email: branding.email ?? "",
    website: branding.website ?? "",
    principalName: branding.principalName ?? "",
    receiptFooter: branding.receiptFooter ?? "",
    reportCardFooter: branding.reportCardFooter ?? "",
    logoDocumentId: branding.logoDocumentId ?? "",
  });

  // Permission Override State
  const [selectedUserId, setSelectedUserId] = useState(initialSelectedUserId);
  const [overrideMap, setOverrideMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const o of initialOverrides) {
      if (o.userId === initialSelectedUserId) map[o.permissionKey] = o.allowed;
    }
    return map;
  });

  // Staff Profiles state Management UI inside Settings
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  // Form states for Add Staff
  const [addForm, setAddForm] = useState({
    employeeCode: "",
    fullName: "",
    phone: "",
    designation: "",
    role: "TEACHER" as "TEACHER" | "ACCOUNTANT",
    createLogin: false,
  });

  // Form states for Edit Staff
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    designation: "",
    isActive: true,
  });

  const selectableUsers = useMemo(
    () =>
      staffProfiles
        .filter((s) => s.user && (s.role === "ACCOUNTANT" || s.role === "TEACHER"))
        .map((s) => ({
          id: s.user!.id,
          name: s.fullName,
          role: s.role,
        })),
    [staffProfiles]
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
          logoDocumentId: form.logoDocumentId || null,
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
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update user");
      }
    });
  }

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.employeeCode.trim() || !addForm.fullName.trim() || !addForm.phone.trim()) {
      toast.error("Employee code, full name, and mobile number are required");
      return;
    }

    startTransition(async () => {
      try {
        await createStaffSettingsAction({
          employeeCode: addForm.employeeCode.trim().toUpperCase(),
          fullName: addForm.fullName.trim(),
          phone: addForm.phone.trim(),
          designation: addForm.designation.trim() || null,
          role: addForm.role,
          createLogin: addForm.createLogin,
        });
        toast.success("Staff profile created successfully");
        setShowAddForm(false);
        setAddForm({
          employeeCode: "",
          fullName: "",
          phone: "",
          designation: "",
          role: "TEACHER",
          createLogin: false,
        });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create staff member");
      }
    });
  };

  const handleStartEdit = (s: StaffProfileRow) => {
    setEditingStaffId(s.id);
    setEditForm({
      fullName: s.fullName,
      phone: s.phone ?? "",
      designation: s.designation ?? "",
      isActive: s.isActive,
    });
  };

  const handleSaveEdit = (id: string) => {
    if (!editForm.fullName.trim() || !editForm.phone.trim()) {
      toast.error("Full name and mobile number are required");
      return;
    }

    startTransition(async () => {
      try {
        await updateStaffSettingsAction({
          id,
          fullName: editForm.fullName.trim(),
          phone: editForm.phone.trim(),
          designation: editForm.designation.trim() || null,
          isActive: editForm.isActive,
        });
        toast.success("Staff profile updated successfully");
        setEditingStaffId(null);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update staff member");
      }
    });
  };

  const handleDeleteStaff = (id: string) => {
    if (!confirm("Are you sure you want to delete this staff profile permanently?")) return;

    startTransition(async () => {
      try {
        await deleteStaffSettingsAction(id);
        toast.success("Staff profile deleted successfully");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete staff member");
      }
    });
  };

  const handleCreateLogin = (id: string) => {
    startTransition(async () => {
      try {
        await createStaffLoginSettingsAction({ staffProfileId: id });
        toast.success("Login account created successfully");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create login account");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* BRANDING CARD */}
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
          <div className="space-y-2 md:col-span-2 border-t pt-3 mt-1">
            <Label>School Logo</Label>
            <div className="flex flex-wrap items-center gap-4 mt-1">
              {form.logoDocumentId ? (
                <img
                  src={`/api/documents/${form.logoDocumentId}`}
                  className="h-16 w-auto object-contain border rounded p-1 bg-stone-50"
                  alt="School Logo"
                />
              ) : (
                <div className="h-16 w-16 bg-stone-100 border border-dashed rounded flex items-center justify-center text-xs text-stone-400">
                  No Logo
                </div>
              )}
              <div className="space-y-1">
                <input
                  type="file"
                  accept="image/*"
                  disabled={pending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error("Logo must be less than 5MB");
                      return;
                    }
                    startTransition(async () => {
                      try {
                        const buffer = await file.arrayBuffer();
                        const bytes = new Uint8Array(buffer);
                        let binary = "";
                        for (let i = 0; i < bytes.length; i++) {
                          binary += String.fromCharCode(bytes[i]!);
                        }
                        const doc = await uploadDocumentAction({
                          ownerType: "SCHOOL",
                          ownerId: schoolId,
                          type: "OTHER",
                          fileName: file.name,
                          mimeType: file.type || "image/png",
                          base64: btoa(binary),
                        });
                        setForm((f) => ({ ...f, logoDocumentId: doc.id }));
                        toast.success("Logo uploaded successfully");
                      } catch {
                        toast.error("Failed to upload logo image");
                      }
                    });
                  }}
                  className="text-xs"
                />
                <p className="text-[10px] text-muted-foreground">Upload school logo (max 5MB)</p>
              </div>
            </div>
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

      {/* STAFF / USERS CONTROL SECTION */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>Users Section (Staff Accounts)</CardTitle>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "Hide Form" : "Add Staff Account"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddForm && (
            <form onSubmit={handleAddStaff} className="space-y-4 border p-4 rounded-xl bg-stone-50/50">
              <h4 className="text-xs uppercase font-extrabold text-stone-500 tracking-wider">Register New Staff User</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="employeeCode" className="text-xs">Employee Code</Label>
                  <Input
                    id="employeeCode"
                    placeholder="e.g. EMP-01"
                    value={addForm.employeeCode}
                    onChange={(e) => setAddForm((f) => ({ ...f, employeeCode: e.target.value }))}
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fullName" className="text-xs">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="e.g. Jane Doe"
                    value={addForm.fullName}
                    onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))}
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs">Mobile Number</Label>
                  <Input
                    id="phone"
                    placeholder="e.g. 9999988888"
                    value={addForm.phone}
                    onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                    className="h-9 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="role" className="text-xs">Role</Label>
                  <Select
                    id="role"
                    value={addForm.role}
                    onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as any }))}
                    className="h-9 text-xs"
                  >
                    <option value="TEACHER">Teacher</option>
                    <option value="ACCOUNTANT">Accountant</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="designation" className="text-xs">Designation</Label>
                  <Input
                    id="designation"
                    placeholder="e.g. Admin assistant"
                    value={addForm.designation}
                    onChange={(e) => setAddForm((f) => ({ ...f, designation: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <input
                    type="checkbox"
                    id="createLogin"
                    checked={addForm.createLogin}
                    onChange={(e) => setAddForm((f) => ({ ...f, createLogin: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-650"
                  />
                  <Label htmlFor="createLogin" className="cursor-pointer text-xs">Create Login Account</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2 text-xs pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={pending} className="bg-stone-900 text-white">
                  {pending ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </form>
          )}

          {/* Directory list of staff profiles */}
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Employee Code</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Login Account</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-150">
                {staffProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-stone-400 font-medium">
                      No staff accounts found.
                    </td>
                  </tr>
                ) : (
                  staffProfiles.map((s) => (
                    <tr key={s.id} className="hover:bg-stone-50/30">
                      {editingStaffId === s.id ? (
                        /* Editing Form Row */
                        <td colSpan={6} className="p-3">
                          <div className="space-y-3 p-2 bg-stone-50 rounded-lg">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold">Full Name</Label>
                                <Input
                                  value={editForm.fullName}
                                  onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold">Mobile Number</Label>
                                <Input
                                  value={editForm.phone}
                                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold">Designation</Label>
                                <Input
                                  value={editForm.designation}
                                  onChange={(e) => setEditForm((f) => ({ ...f, designation: e.target.value }))}
                                  className="h-8 text-xs"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <Button size="sm" variant="ghost" onClick={() => setEditingStaffId(null)}>
                                Cancel
                              </Button>
                              <Button size="sm" onClick={() => handleSaveEdit(s.id)} disabled={pending}>
                                Save Changes
                              </Button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        /* Display Staff Row */
                        <>
                          <td className="p-3 font-mono font-bold text-stone-600">{s.employeeCode}</td>
                          <td className="p-3">
                            <div>
                              <p className="font-bold text-stone-900">{s.fullName}</p>
                              <p className="text-[10px] text-stone-500 mt-0.5">{s.phone || "—"}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="rounded-md">{s.role}</Badge>
                          </td>
                          <td className="p-3 text-stone-600">{s.designation || "—"}</td>
                          <td className="p-3">
                            {s.user ? (
                              <div className="flex items-center gap-2">
                                <Badge variant={s.user.isActive ? "success" : "secondary"}>
                                  {s.user.isActive ? "Active" : "Inactive"}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending}
                                  onClick={() => toggleActive(s.user!.id, !s.user!.isActive)}
                                >
                                  {s.user.isActive ? "Deactivate" : "Activate"}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={pending}
                                onClick={() => handleCreateLogin(s.id)}
                              >
                                  Create Login
                              </Button>
                            )}
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartEdit(s)}
                              className="text-stone-600 hover:text-stone-900 font-bold animate-fade-in"
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => handleDeleteStaff(s.id)}
                              className="text-rose-650 hover:text-rose-700 font-bold"
                            >
                              Delete
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* PERMISSION OVERRIDES CARD */}
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

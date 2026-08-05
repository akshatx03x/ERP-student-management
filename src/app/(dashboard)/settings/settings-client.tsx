"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
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
  createUserAction,
  resetUserPasswordAction,
  updateUserCredentialsAction,
} from "@/server/actions/settings.actions";
import { uploadDocumentAction } from "@/server/actions/platform.actions";
import type { PermissionGroup, PermissionPreset, PermissionKey } from "@/config/permissions";

// ─── Types ───────────────────────────────────────────────────────────────────

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
    loginIdentifier: string | null;
  } | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  loginIdentifier: string | null;
  mustChangePassword: boolean;
  staffProfile: { id: string; employeeCode: string; designation: string | null } | null;
  staffProfileId: string | null;
  student: { admissionNo: string } | null;
  createdBy: string;
  lastLogin: Date | null;
};

// ─── Role Display Helpers ─────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  PRINCIPAL: "Principal",
  ACCOUNTANT: "Accountant",
  TEACHER: "Teacher",
  STUDENT: "Student",
  DEVELOPER: "Developer",
};

const ROLE_COLORS: Record<string, string> = {
  PRINCIPAL: "bg-violet-100 text-violet-800 border-violet-200",
  ACCOUNTANT: "bg-blue-100 text-blue-800 border-blue-200",
  TEACHER: "bg-emerald-100 text-emerald-800 border-emerald-200",
  STUDENT: "bg-amber-100 text-amber-800 border-amber-200",
  DEVELOPER: "bg-rose-100 text-rose-800 border-rose-200",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ROLE_COLORS[role] ?? "bg-stone-100 text-stone-700"}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ─── Permission Panel ─────────────────────────────────────────────────────────

function PermissionPanel({
  groups,
  presets,
  overrideMap,
  onToggle,
  onApplyPreset,
  disabled,
}: {
  groups: PermissionGroup[];
  presets: PermissionPreset[];
  overrideMap: Record<string, boolean>;
  onToggle: (key: string, val: boolean) => void;
  onApplyPreset: (presetId: string) => void;
  disabled: boolean;
}) {
  const [selectedPreset, setSelectedPreset] = useState("");

  const handleApplyPreset = () => {
    if (!selectedPreset) return;
    onApplyPreset(selectedPreset);
    toast.success("Preset applied — you can still customize individual permissions below");
  };

  // Count enabled permissions per group for summary
  const groupCounts = useMemo(() => {
    return groups.map((g) => ({
      label: g.label,
      enabled: g.permissions.filter((p) => overrideMap[p.key]).length,
      total: g.permissions.length,
    }));
  }, [groups, overrideMap]);

  return (
    <div className="space-y-5">
      {/* Preset Selector */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4">
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label className="text-xs font-semibold text-indigo-800">Apply Permission Preset</Label>
          <select
            className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            disabled={disabled}
          >
            <option value="">— Select a preset to start with —</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {selectedPreset && (
            <p className="text-[11px] text-indigo-600">
              {presets.find((p) => p.id === selectedPreset)?.description}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!selectedPreset || disabled}
          onClick={handleApplyPreset}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Apply Preset
        </Button>
      </div>

      {/* Group summary pills */}
      <div className="flex flex-wrap gap-2">
        {groupCounts.map((g) => (
          <span
            key={g.label}
            className={`rounded-full border px-3 py-0.5 text-[11px] font-medium ${
              g.enabled > 0 ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-stone-200 bg-stone-50 text-stone-500"
            }`}
          >
            {g.label}: {g.enabled}/{g.total}
          </span>
        ))}
      </div>

      {/* Permission Groups */}
      <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.label} className="rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b bg-stone-50 px-4 py-2.5 rounded-t-xl">
              <div>
                <p className="text-xs font-bold text-stone-800 uppercase tracking-wide">{group.label}</p>
                <p className="text-[10px] text-stone-500 mt-0.5">{group.description}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => group.permissions.forEach((p) => onToggle(p.key, true))}
                  disabled={disabled}
                  className="rounded text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 disabled:opacity-40"
                >
                  All
                </button>
                <span className="text-stone-300">|</span>
                <button
                  type="button"
                  onClick={() => group.permissions.forEach((p) => onToggle(p.key, false))}
                  disabled={disabled}
                  className="rounded text-[10px] font-semibold text-rose-500 hover:text-rose-700 disabled:opacity-40"
                >
                  None
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-0 divide-y divide-stone-100">
              {group.permissions.map((p) => (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors"
                >
                  <span className="text-sm text-stone-700">{p.label}</span>
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={overrideMap[p.key] ?? false}
                      onChange={(e) => onToggle(p.key, e.target.checked)}
                      disabled={disabled}
                      className="peer sr-only"
                    />
                    <div className={`h-5 w-9 rounded-full border transition-colors ${
                      overrideMap[p.key]
                        ? "bg-emerald-500 border-emerald-500"
                        : "bg-stone-200 border-stone-300"
                    } peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400`}>
                      <div className={`mt-0.5 ml-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        overrideMap[p.key] ? "translate-x-4" : "translate-x-0"
                      }`} />
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-base font-bold text-stone-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "branding" | "staff" | "users";

// ─── Main Component ───────────────────────────────────────────────────────────

export function SettingsClient({
  branding,
  staffProfiles,
  users,
  permissionGroups,
  permissionPresets,
  schoolId,
  isAdminView,
}: {
  branding: Branding;
  staffProfiles: StaffProfileRow[];
  users: UserRow[];
  permissionGroups: PermissionGroup[];
  permissionPresets: PermissionPreset[];
  schoolId: string;
  isAdminView: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<Tab>(isAdminView ? "users" : "branding");

  // ── Branding State ────────────────────────────────────────────────────────

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

  // ── Staff State ───────────────────────────────────────────────────────────

  const [showAddStaff, setShowAddStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [addStaffForm, setAddStaffForm] = useState({
    employeeCode: "",
    fullName: "",
    phone: "",
    designation: "",
    role: "TEACHER" as "TEACHER" | "ACCOUNTANT",
    createLogin: false,
  });
  const [editStaffForm, setEditStaffForm] = useState({
    fullName: "",
    phone: "",
    designation: "",
    isActive: true,
  });

  // ── User Management State ─────────────────────────────────────────────────

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    name: "",
    email: "",
    password: "",
    designation: "",
    role: "TEACHER" as "TEACHER" | "ACCOUNTANT",
    presetId: "",
  });

  // Reset Password Modal
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Edit Credentials Modal
  const [editCredentialsTarget, setEditCredentialsTarget] = useState<UserRow | null>(null);
  const [editLoginId, setEditLoginId] = useState("");

  const generateSecurePassword = useCallback(() => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
    let password = "";
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    password += "0123456789"[Math.floor(Math.random() * 10)];
    password += "!@#$%^&*()"[Math.floor(Math.random() * 10)];
    for (let i = 0; i < 6; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  }, []);

  // Permission Edit Modal
  const [permTarget, setPermTarget] = useState<UserRow | null>(null);
  const [overrideMap, setOverrideMap] = useState<Record<string, boolean>>({});
  const [loadingPerms, setLoadingPerms] = useState(false);

  const handleTogglePerm = useCallback((key: string, val: boolean) => {
    setOverrideMap((m) => ({ ...m, [key]: val }));
  }, []);

  const handleApplyPreset = useCallback((presetId: string) => {
    const preset = permissionPresets.find((p) => p.id === presetId);
    if (!preset) return;
    // Reset all to false, then enable preset permissions
    const newMap: Record<string, boolean> = {};
    for (const group of permissionGroups) {
      for (const p of group.permissions) {
        newMap[p.key] = false;
      }
    }
    for (const key of preset.permissions) {
      newMap[key] = true;
    }
    setOverrideMap(newMap);
  }, [permissionGroups, permissionPresets]);

  // ── Actions ────────────────────────────────────────────────────────────────

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

  function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createUserAction({
          name: createUserForm.name.trim(),
          email: createUserForm.email.trim(),
          password: createUserForm.password,
          designation: createUserForm.designation.trim(),
          role: createUserForm.role,
          presetId: createUserForm.presetId || undefined,
        });
        toast.success(`User "${createUserForm.name}" created successfully`);
        setShowCreateUser(false);
        setCreateUserForm({ name: "", email: "", password: "", designation: "", role: "TEACHER", presetId: "" });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create user");
      }
    });
  }

  function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    startTransition(async () => {
      try {
        await resetUserPasswordAction({ userId: resetTarget.id, password: newPassword });
        toast.success(`Password reset for ${resetTarget.name}`);
        setResetTarget(null);
        setNewPassword("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to reset password");
      }
    });
  }

  function handleUpdateCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!editCredentialsTarget) return;
    startTransition(async () => {
      try {
        await updateUserCredentialsAction({
          userId: editCredentialsTarget.id,
          loginIdentifier: editLoginId,
        });
        toast.success(`Login ID updated for ${editCredentialsTarget.name}`);
        setEditCredentialsTarget(null);
        setEditLoginId("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update login ID");
      }
    });
  }

  async function openPermissions(user: UserRow) {
    setPermTarget(user);
    setLoadingPerms(true);
    try {
      const overrides = await getUserOverridesAction(user.id);
      const map: Record<string, boolean> = {};
      for (const o of overrides) {
        map[o.permission.key] = o.allowed;
      }
      setOverrideMap(map);
    } catch {
      toast.error("Failed to load permissions");
    } finally {
      setLoadingPerms(false);
    }
  }

  function savePermissions() {
    if (!permTarget) return;
    startTransition(async () => {
      try {
        const payload = Object.entries(overrideMap).map(([permissionKey, allowed]) => ({
          permissionKey,
          allowed,
        }));
        await updatePermissionsAction({ userId: permTarget.id, permissions: payload });
        toast.success("Permissions saved");
        setPermTarget(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save permissions");
      }
    });
  }

  // Staff actions
  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addStaffForm.employeeCode.trim() || !addStaffForm.fullName.trim() || !addStaffForm.phone.trim()) {
      toast.error("Employee code, full name, and mobile number are required");
      return;
    }
    startTransition(async () => {
      try {
        await createStaffSettingsAction({
          employeeCode: addStaffForm.employeeCode.trim().toUpperCase(),
          fullName: addStaffForm.fullName.trim(),
          phone: addStaffForm.phone.trim(),
          designation: addStaffForm.designation.trim() || null,
          role: addStaffForm.role,
          createLogin: addStaffForm.createLogin,
        });
        toast.success("Staff profile created");
        setShowAddStaff(false);
        setAddStaffForm({ employeeCode: "", fullName: "", phone: "", designation: "", role: "TEACHER", createLogin: false });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create staff member");
      }
    });
  };

  const handleSaveEditStaff = (id: string) => {
    if (!editStaffForm.fullName.trim() || !editStaffForm.phone.trim()) {
      toast.error("Full name and mobile number are required");
      return;
    }
    startTransition(async () => {
      try {
        await updateStaffSettingsAction({
          id,
          fullName: editStaffForm.fullName.trim(),
          phone: editStaffForm.phone.trim(),
          designation: editStaffForm.designation.trim() || null,
          isActive: editStaffForm.isActive,
        });
        toast.success("Staff updated");
        setEditingStaffId(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update staff member");
      }
    });
  };

  const handleDeleteStaff = (id: string) => {
    if (!confirm("Are you sure you want to delete this staff profile permanently?")) return;
    startTransition(async () => {
      try {
        await deleteStaffSettingsAction(id);
        toast.success("Staff profile deleted");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete staff member");
      }
    });
  };

  const handleCreateLogin = (id: string) => {
    startTransition(async () => {
      try {
        await createStaffLoginSettingsAction({ staffProfileId: id });
        toast.success("Login account created");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create login account");
      }
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string }[] = [
    ...(isAdminView ? [{ id: "users" as Tab, label: "User Management" }] : []),
    { id: "branding", label: "School Branding" },
    { id: "staff", label: "Staff Profiles" },
  ];

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex gap-1 rounded-xl border bg-stone-50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: USER MANAGEMENT ─────────────────────────────────────────── */}
      {activeTab === "users" && isAdminView && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>User Management</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Create and manage staff login accounts and permissions
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreateUser(true)}
              className="bg-stone-900 text-white hover:bg-stone-700"
            >
              + Create User
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <table className="w-full text-xs text-left">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Login ID</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Last Login</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-stone-400">
                        No users found. Click &quot;Create User&quot; to add your first staff account.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isProtected = u.role === "PRINCIPAL" || u.role === "DEVELOPER";
                      return (
                        <tr key={u.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="p-3">
                            <p className="font-semibold text-stone-900">{u.name}</p>
                            {u.staffProfile?.designation && (
                              <p className="text-[10px] text-stone-500">{u.staffProfile.designation}</p>
                            )}
                          </td>
                          <td className="p-3 text-stone-600">{u.email}</td>
                          <td className="p-3 text-stone-650 font-mono">{u.loginIdentifier || "—"}</td>
                          <td className="p-3">
                            <RoleBadge role={u.role} />
                          </td>
                          <td className="p-3 text-stone-500">
                            {u.lastLogin
                              ? new Date(u.lastLogin).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "Never"}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              u.isActive
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-stone-100 text-stone-500"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-stone-400"}`} />
                              {u.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {!isProtected && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => openPermissions(u)}
                                    className="text-[11px] h-7 px-2"
                                  >
                                    Permissions
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => { setEditCredentialsTarget(u); setEditLoginId(u.loginIdentifier || ""); }}
                                    className="text-[11px] h-7 px-2"
                                  >
                                    Change Login ID
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => { setResetTarget(u); setNewPassword(""); }}
                                    className="text-[11px] h-7 px-2"
                                  >
                                    Reset Password
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={u.isActive ? "ghost" : "outline"}
                                    disabled={pending}
                                    onClick={() => toggleActive(u.id, !u.isActive)}
                                    className={`text-[11px] h-7 px-2 ${u.isActive ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                                  >
                                    {u.isActive ? "Deactivate" : "Activate"}
                                  </Button>
                                </>
                              )}
                              {isProtected && (
                                <>
                                  {u.role === "PRINCIPAL" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={pending}
                                        onClick={() => { setResetTarget(u); setNewPassword(""); }}
                                        className="text-[11px] h-7 px-2"
                                      >
                                        Reset Password
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={pending || users.filter((user) => user.role === "PRINCIPAL").length <= 1}
                                        onClick={() => {
                                          const profileId = u.staffProfile?.id || u.staffProfileId;
                                          if (profileId) {
                                            handleDeleteStaff(profileId);
                                          } else {
                                            toast.error("Linked staff profile not found");
                                          }
                                        }}
                                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-[11px] h-7 px-2"
                                      >
                                        Delete
                                      </Button>
                                    </>
                                  )}
                                  <span className="text-[10px] text-stone-400 italic">Protected</span>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TAB: BRANDING ─────────────────────────────────────────────────── */}
      {activeTab === "branding" && (
        <Card>
          <CardHeader>
            <CardTitle>School Branding</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>School name</Label>
              <Input value={form.schoolName} onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Principal name</Label>
              <Input value={form.principalName} onChange={(e) => setForm((f) => ({ ...f, principalName: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address</Label>
              <Textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
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
                          toast.success("Logo uploaded");
                        } catch {
                          toast.error("Failed to upload logo");
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
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Receipt footer</Label>
              <Textarea value={form.receiptFooter} onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Report card footer</Label>
              <Textarea value={form.reportCardFooter} onChange={(e) => setForm((f) => ({ ...f, reportCardFooter: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Button type="button" onClick={saveBranding} disabled={pending}>
                Save Branding
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TAB: STAFF PROFILES ──────────────────────────────────────────── */}
      {activeTab === "staff" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle>Staff Profiles</CardTitle>
            <Button size="sm" onClick={() => setShowAddStaff(!showAddStaff)}>
              {showAddStaff ? "Hide Form" : "Add Staff Account"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {showAddStaff && (
              <form onSubmit={handleAddStaff} className="space-y-4 border p-4 rounded-xl bg-stone-50/50">
                <h4 className="text-xs uppercase font-extrabold text-stone-500 tracking-wider">Register New Staff User</h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="employeeCode" className="text-xs">Employee Code</Label>
                    <Input id="employeeCode" placeholder="e.g. EMP-01" value={addStaffForm.employeeCode} onChange={(e) => setAddStaffForm((f) => ({ ...f, employeeCode: e.target.value }))} className="h-9 text-xs" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="fullName" className="text-xs">Full Name</Label>
                    <Input id="fullName" placeholder="e.g. Jane Doe" value={addStaffForm.fullName} onChange={(e) => setAddStaffForm((f) => ({ ...f, fullName: e.target.value }))} className="h-9 text-xs" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="phone" className="text-xs">Mobile Number</Label>
                    <Input id="phone" placeholder="e.g. 9999988888" value={addStaffForm.phone} onChange={(e) => setAddStaffForm((f) => ({ ...f, phone: e.target.value }))} className="h-9 text-xs" required />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="staffRole" className="text-xs">Role</Label>
                    <Select id="staffRole" value={addStaffForm.role} onChange={(e) => setAddStaffForm((f) => ({ ...f, role: e.target.value as any }))} className="h-9 text-xs">
                      <option value="TEACHER">Teacher</option>
                      <option value="ACCOUNTANT">Accountant</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="designation" className="text-xs">Designation</Label>
                    <Input id="designation" placeholder="e.g. Admin assistant" value={addStaffForm.designation} onChange={(e) => setAddStaffForm((f) => ({ ...f, designation: e.target.value }))} className="h-9 text-xs" />
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <input type="checkbox" id="createLogin" checked={addStaffForm.createLogin} onChange={(e) => setAddStaffForm((f) => ({ ...f, createLogin: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
                    <Label htmlFor="createLogin" className="cursor-pointer text-xs">Create Login Account</Label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 text-xs pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddStaff(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={pending} className="bg-stone-900 text-white">
                    {pending ? "Saving..." : "Save Profile"}
                  </Button>
                </div>
              </form>
            )}

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
                <tbody className="divide-y divide-stone-100">
                  {staffProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-stone-400 font-medium">No staff accounts found.</td>
                    </tr>
                  ) : (
                    staffProfiles.map((s) => (
                      <tr key={s.id} className="hover:bg-stone-50/30">
                        {editingStaffId === s.id ? (
                          <td colSpan={6} className="p-3">
                            <div className="space-y-3 p-2 bg-stone-50 rounded-lg">
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase font-bold">Full Name</Label>
                                  <Input value={editStaffForm.fullName} onChange={(e) => setEditStaffForm((f) => ({ ...f, fullName: e.target.value }))} className="h-8 text-xs" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase font-bold">Mobile Number</Label>
                                  <Input value={editStaffForm.phone} onChange={(e) => setEditStaffForm((f) => ({ ...f, phone: e.target.value }))} className="h-8 text-xs" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase font-bold">Designation</Label>
                                  <Input value={editStaffForm.designation} onChange={(e) => setEditStaffForm((f) => ({ ...f, designation: e.target.value }))} className="h-8 text-xs" />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <Button size="sm" variant="ghost" onClick={() => setEditingStaffId(null)}>Cancel</Button>
                                <Button size="sm" onClick={() => handleSaveEditStaff(s.id)} disabled={pending}>Save Changes</Button>
                              </div>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="p-3 font-mono font-bold text-stone-600">{s.employeeCode}</td>
                            <td className="p-3">
                              <p className="font-bold text-stone-900">{s.fullName}</p>
                              <p className="text-[10px] text-stone-500 mt-0.5">{s.phone || "—"}</p>
                            </td>
                            <td className="p-3"><RoleBadge role={s.role} /></td>
                            <td className="p-3 text-stone-600">{s.designation || "—"}</td>
                            <td className="p-3">
                              {s.user ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={s.user.isActive ? "success" : "secondary"}>
                                      {s.user.isActive ? "Active" : "Inactive"}
                                    </Badge>
                                    <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleActive(s.user!.id, !s.user!.isActive)}>
                                      {s.user.isActive ? "Deactivate" : "Activate"}
                                    </Button>
                                  </div>
                                  <p className="text-[10px] text-stone-500 font-mono">ID: {s.user.loginIdentifier || "—"}</p>
                                </div>
                              ) : (
                                <Button size="sm" variant="secondary" disabled={pending} onClick={() => handleCreateLogin(s.id)}>
                                  Create Login
                                </Button>
                              )}
                            </td>
                            <td className="p-3 text-right space-x-1.5">
                              <Button size="sm" variant="ghost" onClick={() => { setEditingStaffId(s.id); setEditStaffForm({ fullName: s.fullName, phone: s.phone ?? "", designation: s.designation ?? "", isActive: s.isActive }); }} className="text-stone-600 hover:text-stone-900 font-bold">
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending || (s.role === "PRINCIPAL" && staffProfiles.filter((staff) => staff.role === "PRINCIPAL").length <= 1)}
                                onClick={() => handleDeleteStaff(s.id)}
                                className="text-rose-600 hover:text-rose-700 font-bold"
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
      )}

      {/* ── MODAL: CREATE USER ───────────────────────────────────────────── */}
      {showCreateUser && (
        <Modal title="Create New User" onClose={() => setShowCreateUser(false)}>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cu-name">Full Name *</Label>
                <Input id="cu-name" required value={createUserForm.name} onChange={(e) => setCreateUserForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya Sharma" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-email">Email Address *</Label>
                <Input id="cu-email" type="email" required value={createUserForm.email} onChange={(e) => setCreateUserForm((f) => ({ ...f, email: e.target.value }))} placeholder="priya@school.edu.in" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-role">Role *</Label>
                <select
                  id="cu-role"
                  required
                  value={createUserForm.role}
                  onChange={(e) => setCreateUserForm((f) => ({ ...f, role: e.target.value as any }))}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                >
                  <option value="TEACHER">Teacher</option>
                  <option value="ACCOUNTANT">Accountant</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-designation">Designation</Label>
                <Input id="cu-designation" value={createUserForm.designation} onChange={(e) => setCreateUserForm((f) => ({ ...f, designation: e.target.value }))} placeholder="e.g. Science Teacher" />
              </div>
            </div>

            {/* Permission Preset Selector */}
            <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
              <Label htmlFor="cu-preset" className="text-xs font-semibold text-indigo-800">
                Permission Preset (Optional)
              </Label>
              <select
                id="cu-preset"
                value={createUserForm.presetId}
                onChange={(e) => setCreateUserForm((f) => ({ ...f, presetId: e.target.value }))}
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">— No preset (assign permissions manually later) —</option>
                {permissionPresets.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {createUserForm.presetId && (
                <p className="text-[11px] text-indigo-600 mt-1">
                  {permissionPresets.find((p) => p.id === createUserForm.presetId)?.description}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="cu-password">Password *</Label>
                <button
                  type="button"
                  onClick={() => {
                    const pass = generateSecurePassword();
                    setCreateUserForm((f) => ({ ...f, password: pass }));
                    setShowPassword(true);
                    toast.success("Generated secure password!");
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Generate Secure
                </button>
              </div>
              <div className="relative">
                <Input
                  id="cu-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={createUserForm.password}
                  onChange={(e) => setCreateUserForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 8 characters, include uppercase, number & symbol"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p className="text-[11px] text-stone-500">Must contain uppercase, lowercase, number and special character</p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setShowCreateUser(false)}>Cancel</Button>
              <Button type="submit" disabled={pending} className="bg-stone-900 text-white">
                {pending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── MODAL: RESET PASSWORD ─────────────────────────────────────────── */}
      {resetTarget && (
        <Modal title={`Reset Password — ${resetTarget.name}`} onClose={() => setResetTarget(null)}>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-sm text-stone-600">
              Enter a new password for <strong>{resetTarget.name}</strong> ({resetTarget.email}).
              The user will be able to log in with this password immediately.
            </p>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="rp-password">New Password *</Label>
                <button
                  type="button"
                  onClick={() => {
                    const pass = generateSecurePassword();
                    setNewPassword(pass);
                    setShowPassword(true);
                    toast.success("Generated secure password!");
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Generate Secure
                </button>
              </div>
              <div className="relative">
                <Input
                  id="rp-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p className="text-[11px] text-stone-500">Must contain uppercase, lowercase, number and special character</p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={pending} className="bg-rose-600 hover:bg-rose-700 text-white">
                {pending ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── MODAL: CHANGE LOGIN ID ─────────────────────────────────────────── */}
      {editCredentialsTarget && (
        <Modal title={`Change Login ID — ${editCredentialsTarget.name}`} onClose={() => setEditCredentialsTarget(null)}>
          <form onSubmit={handleUpdateCredentials} className="space-y-4">
            <p className="text-sm text-stone-600">
              Enter the new Login ID for <strong>{editCredentialsTarget.name}</strong>.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="ec-loginid">Login ID *</Label>
              <Input
                id="ec-loginid"
                required
                value={editLoginId}
                onChange={(e) => setEditLoginId(e.target.value)}
                placeholder="e.g. employee.code"
              />
              <p className="text-[11px] text-stone-500">
                This is the ID the user logs in with. It must be unique across all users.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setEditCredentialsTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={pending} className="bg-stone-900 text-white">
                {pending ? "Saving..." : "Change Login ID"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── MODAL: EDIT PERMISSIONS ───────────────────────────────────────── */}
      {permTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPermTarget(null)} />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
              <div>
                <h3 className="text-base font-bold text-stone-900">Edit Permissions — {permTarget.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  <RoleBadge role={permTarget.role} /> &nbsp;{permTarget.email}
                </p>
              </div>
              <button onClick={() => setPermTarget(null)} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 flex-1">
              {loadingPerms ? (
                <div className="flex items-center justify-center py-12 text-stone-400">Loading permissions…</div>
              ) : (
                <PermissionPanel
                  groups={permissionGroups}
                  presets={permissionPresets}
                  overrideMap={overrideMap}
                  onToggle={handleTogglePerm}
                  onApplyPreset={handleApplyPreset}
                  disabled={pending}
                />
              )}
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4 shrink-0">
              <Button variant="outline" onClick={() => setPermTarget(null)}>Cancel</Button>
              <Button onClick={savePermissions} disabled={pending || loadingPerms} className="bg-stone-900 text-white">
                {pending ? "Saving..." : "Save Permissions"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

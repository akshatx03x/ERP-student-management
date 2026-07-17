"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  createStaffAction,
  updateStaffAction,
  deleteStaffAction,
  createStaffLoginAction,
} from "@/server/actions/staff.actions";

type StaffRow = {
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

export function StaffClient({ initialStaff }: { initialStaff: StaffRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.employeeCode.trim() || !addForm.fullName.trim() || !addForm.phone.trim()) {
      toast.error("Employee code, full name, and mobile number are required");
      return;
    }

    startTransition(async () => {
      try {
        await createStaffAction({
          employeeCode: addForm.employeeCode.trim().toUpperCase(),
          fullName: addForm.fullName.trim(),
          phone: addForm.phone.trim(),
          designation: addForm.designation.trim() || null,
          role: addForm.role,
          createLogin: addForm.createLogin,
        });
        toast.success("Staff profile created");
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

  const handleStartEdit = (s: StaffRow) => {
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
        await updateStaffAction({
          id,
          fullName: editForm.fullName.trim(),
          phone: editForm.phone.trim(),
          designation: editForm.designation.trim() || null,
          isActive: editForm.isActive,
        });
        toast.success("Staff profile updated");
        setEditingStaffId(null);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update staff member");
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this staff profile permanently?")) return;

    startTransition(async () => {
      try {
        await deleteStaffAction(id);
        toast.success("Staff profile deleted");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete staff member");
      }
    });
  };

  const handleCreateLogin = (id: string) => {
    startTransition(async () => {
      try {
        await createStaffLoginAction({ staffProfileId: id });
        toast.success("Login account created");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create login account");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">All Staff Profiles</h2>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? "Hide Form" : "Add Staff Member"}
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Register New Staff Member</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="employeeCode">Employee Code</Label>
                  <Input
                    id="employeeCode"
                    placeholder="e.g. TCH-01"
                    value={addForm.employeeCode}
                    onChange={(e) => setAddForm((f) => ({ ...f, employeeCode: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="e.g. John Doe"
                    value={addForm.fullName}
                    onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Mobile Number</Label>
                  <Input
                    id="phone"
                    placeholder="e.g. +91 99999 88888"
                    value={addForm.phone}
                    onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    id="role"
                    value={addForm.role}
                    onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as "TEACHER" | "ACCOUNTANT" }))}
                  >
                    <option value="TEACHER">Teacher</option>
                    <option value="ACCOUNTANT">Accountant</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    placeholder="e.g. Math Instructor / Cashier"
                    value={addForm.designation}
                    onChange={(e) => setAddForm((f) => ({ ...f, designation: e.target.value }))}
                  />
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <input
                    type="checkbox"
                    id="createLogin"
                    checked={addForm.createLogin}
                    onChange={(e) => setAddForm((f) => ({ ...f, createLogin: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="createLogin" className="cursor-pointer">Create Login Account</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Designation</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Login</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {initialStaff.map((s) => {
              const isEditing = editingStaffId === s.id;
              return (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{s.employeeCode}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <Input
                        value={editForm.fullName}
                        onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                        className="h-8"
                      />
                    ) : (
                      s.fullName
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{s.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <Input
                        value={editForm.designation}
                        onChange={(e) => setEditForm((f) => ({ ...f, designation: e.target.value }))}
                        className="h-8"
                      />
                    ) : (
                      s.designation || "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <Input
                        value={editForm.phone}
                        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                        className="h-8"
                      />
                    ) : (
                      s.phone || "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.user ? (
                      <span className="text-xs text-muted-foreground">{s.user.email}</span>
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
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <Select
                        value={editForm.isActive ? "active" : "inactive"}
                        onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.value === "active" }))}
                        className="h-8"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </Select>
                    ) : (
                      <Badge variant={s.isActive ? "success" : "secondary"}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingStaffId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() => handleSaveEdit(s.id)}
                          >
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStartEdit(s)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={pending}
                            onClick={() => handleDelete(s.id)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

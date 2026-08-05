// ─────────────────────────────────────────────────────────────────────────────
// Permission Actions & Resources
// New modules can add entries here without touching RBAC core logic.
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSION_ACTIONS = [
  "view",
  "create",
  "update",
  "delete",
  "export",
  "import",
  "approve",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_RESOURCES = [
  "dashboard",
  "session",
  "admission",
  "student",
  "family",
  "class",
  "section",
  "subject",
  "attendance",
  "leave",
  "holiday",
  "timetable",
  "exam",
  "marks",
  "result",
  "homework",
  "fee",
  "payment",
  "document",
  "report",
  "notice",
  "user",
  "permission",
  "audit",
  "import",
  "settings",
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export type PermissionKey = `${PermissionResource}.${PermissionAction}`;

export function permissionKey(
  resource: PermissionResource,
  action: PermissionAction,
): PermissionKey {
  return `${resource}.${action}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission Groups
// Used by UI to render permissions in logical sections.
// New modules register here; RBAC core does not need to change.
// ─────────────────────────────────────────────────────────────────────────────

export type PermissionGroup = {
  label: string;
  description: string;
  permissions: Array<{
    key: PermissionKey;
    label: string;
  }>;
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Students & Admissions",
    description: "Manage student records, admissions, and family information",
    permissions: [
      { key: "admission.view", label: "View Admissions" },
      { key: "admission.create", label: "Create Admission" },
      { key: "admission.update", label: "Edit Admission" },
      { key: "admission.approve", label: "Approve Admission" },
      { key: "admission.delete", label: "Delete Admission" },
      { key: "student.view", label: "View Students" },
      { key: "student.create", label: "Add Student" },
      { key: "student.update", label: "Edit Student" },
      { key: "student.delete", label: "Delete Student" },
      { key: "student.export", label: "Export Students" },
      { key: "family.view", label: "View Family Records" },
      { key: "family.create", label: "Add Family Record" },
      { key: "family.update", label: "Edit Family Record" },
      { key: "family.delete", label: "Delete Family Record" },
    ],
  },
  {
    label: "Academics",
    description: "Classes, sections, subjects, sessions and timetables",
    permissions: [
      { key: "session.view", label: "View Academic Sessions" },
      { key: "session.create", label: "Create Session" },
      { key: "session.update", label: "Edit Session" },
      { key: "session.delete", label: "Delete Session" },
      { key: "class.view", label: "View Classes" },
      { key: "class.create", label: "Create Class" },
      { key: "class.update", label: "Edit Class" },
      { key: "class.delete", label: "Delete Class" },
      { key: "section.view", label: "View Sections" },
      { key: "section.create", label: "Create Section" },
      { key: "section.update", label: "Edit Section" },
      { key: "subject.view", label: "View Subjects" },
      { key: "subject.create", label: "Create Subject" },
      { key: "subject.update", label: "Edit Subject" },
      { key: "timetable.view", label: "View Timetable" },
      { key: "timetable.create", label: "Create Timetable" },
      { key: "timetable.update", label: "Edit Timetable" },
    ],
  },
  {
    label: "Attendance",
    description: "Mark and manage student attendance and leave",
    permissions: [
      { key: "attendance.view", label: "View Attendance" },
      { key: "attendance.create", label: "Mark Attendance" },
      { key: "attendance.update", label: "Edit Attendance" },
      { key: "attendance.delete", label: "Delete Attendance" },
      { key: "attendance.export", label: "Export Attendance" },
      { key: "leave.view", label: "View Leave Requests" },
      { key: "leave.create", label: "Submit Leave Request" },
      { key: "leave.update", label: "Approve / Edit Leave" },
      { key: "leave.delete", label: "Delete Leave" },
      { key: "holiday.view", label: "View Holidays" },
      { key: "holiday.create", label: "Add Holiday" },
      { key: "holiday.update", label: "Edit Holiday" },
      { key: "holiday.delete", label: "Delete Holiday" },
    ],
  },
  {
    label: "Exams & Results",
    description: "Manage exams, marks entry and result publishing",
    permissions: [
      { key: "exam.view", label: "View Exams" },
      { key: "exam.create", label: "Create Exam" },
      { key: "exam.update", label: "Edit Exam" },
      { key: "exam.delete", label: "Delete Exam" },
      { key: "marks.view", label: "View Marks" },
      { key: "marks.create", label: "Enter Marks" },
      { key: "marks.update", label: "Edit Marks" },
      { key: "marks.delete", label: "Delete Marks" },
      { key: "result.view", label: "View Results" },
      { key: "result.create", label: "Generate Results" },
      { key: "result.update", label: "Edit Results" },
      { key: "result.export", label: "Export / Print Results" },
    ],
  },
  {
    label: "Finance & Fees",
    description: "Fee collection, payments and financial reports",
    permissions: [
      { key: "fee.view", label: "View Fee Structure" },
      { key: "fee.create", label: "Create Fee" },
      { key: "fee.update", label: "Edit Fee" },
      { key: "fee.delete", label: "Delete Fee" },
      { key: "payment.view", label: "View Payments" },
      { key: "payment.create", label: "Collect Payment" },
      { key: "payment.update", label: "Edit Payment" },
      { key: "payment.delete", label: "Delete Payment" },
      { key: "payment.export", label: "Export Payments / Print Receipt" },
      { key: "report.view", label: "View Reports" },
      { key: "report.export", label: "Export Reports" },
    ],
  },
  {
    label: "Communication",
    description: "Notices, homework and documents",
    permissions: [
      { key: "notice.view", label: "View Notices" },
      { key: "notice.create", label: "Create Notice" },
      { key: "notice.update", label: "Edit Notice" },
      { key: "notice.delete", label: "Delete Notice" },
      { key: "homework.view", label: "View Homework" },
      { key: "homework.create", label: "Assign Homework" },
      { key: "homework.update", label: "Edit Homework" },
      { key: "homework.delete", label: "Delete Homework" },
      { key: "document.view", label: "View Documents" },
      { key: "document.create", label: "Upload Document" },
      { key: "document.delete", label: "Delete Document" },
    ],
  },
  {
    label: "System Administration",
    description: "User management, permissions and system settings",
    permissions: [
      { key: "user.view", label: "View Users" },
      { key: "user.create", label: "Create User" },
      { key: "user.update", label: "Edit User / Reset Password" },
      { key: "user.delete", label: "Deactivate User" },
      { key: "permission.view", label: "View Permissions" },
      { key: "permission.update", label: "Edit Permissions" },
      { key: "audit.view", label: "View Audit Log" },
      { key: "settings.view", label: "View Settings" },
      { key: "settings.update", label: "Modify Settings" },
      { key: "import.create", label: "Import Data (Excel)" },
      { key: "import.delete", label: "Bulk Operations" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Permission Presets
// Built-in templates for common roles. Principal and Developer are protected
// system roles and must never appear here.
// ─────────────────────────────────────────────────────────────────────────────

export type PermissionPreset = {
  id: string;
  label: string;
  description: string;
  permissions: PermissionKey[];
};

export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    id: "teacher",
    label: "Teacher",
    description: "Can mark attendance, enter marks, manage homework and view student info",
    permissions: [
      "dashboard.view",
      "session.view",
      "student.view",
      "class.view",
      "section.view",
      "subject.view",
      "attendance.view",
      "attendance.create",
      "attendance.update",
      "attendance.export",
      "leave.view",
      "leave.create",
      "leave.update",
      "timetable.view",
      "exam.view",
      "marks.view",
      "marks.create",
      "marks.update",
      "result.view",
      "homework.view",
      "homework.create",
      "homework.update",
      "document.view",
      "notice.view",
    ],
  },
  {
    id: "accountant",
    label: "Accountant / Fee Manager",
    description: "Can manage fee collection, payments, reports and student admissions",
    permissions: [
      "dashboard.view",
      "session.view",
      "admission.view",
      "admission.create",
      "admission.update",
      "admission.approve",
      "student.view",
      "student.create",
      "student.update",
      "student.export",
      "family.view",
      "family.create",
      "family.update",
      "fee.view",
      "fee.create",
      "fee.update",
      "payment.view",
      "payment.create",
      "payment.update",
      "payment.export",
      "report.view",
      "report.export",
      "document.view",
      "document.create",
    ],
  },
  {
    id: "reception",
    label: "Reception",
    description: "Can view students and admissions, create notices and handle basic office tasks",
    permissions: [
      "dashboard.view",
      "session.view",
      "admission.view",
      "admission.create",
      "admission.update",
      "student.view",
      "student.create",
      "family.view",
      "family.create",
      "fee.view",
      "payment.view",
      "notice.view",
      "notice.create",
      "notice.update",
      "document.view",
      "document.create",
    ],
  },
  {
    id: "librarian",
    label: "Librarian",
    description: "Can view student info, manage documents and notices",
    permissions: [
      "dashboard.view",
      "session.view",
      "student.view",
      "document.view",
      "document.create",
      "document.delete",
      "notice.view",
      "notice.create",
    ],
  },
  {
    id: "office_staff",
    label: "Office Staff",
    description: "Can view most records, create notices and handle document management",
    permissions: [
      "dashboard.view",
      "session.view",
      "student.view",
      "student.export",
      "admission.view",
      "family.view",
      "attendance.view",
      "attendance.export",
      "fee.view",
      "payment.view",
      "report.view",
      "notice.view",
      "notice.create",
      "notice.update",
      "document.view",
      "document.create",
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Default role grants (Principal and Developer get all via code path in guard.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Default role grants (Principal gets all via code path). */
export const ROLE_DEFAULT_PERMISSIONS: Record<
  "ACCOUNTANT" | "TEACHER" | "STUDENT",
  PermissionKey[]
> = {
  ACCOUNTANT: PERMISSION_PRESETS.find((p) => p.id === "accountant")!.permissions,
  TEACHER: PERMISSION_PRESETS.find((p) => p.id === "teacher")!.permissions,
  STUDENT: [
    "dashboard.view",
    "session.view",
    "student.view",
    "attendance.view",
    "timetable.view",
    "exam.view",
    "result.view",
    "homework.view",
    "fee.view",
    "payment.view",
    "document.view",
    "notice.view",
    "leave.view",
    "leave.create",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

export type NavItem = {
  title: string;
  href: string;
  resource: PermissionResource;
  icon: string;
};

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "School Office",
    items: [
      { title: "Dashboard", href: "/dashboard", resource: "dashboard", icon: "LayoutDashboard" },
      { title: "Admissions", href: "/admissions", resource: "admission", icon: "ClipboardList" },
      { title: "Active Students", href: "/students", resource: "student", icon: "GraduationCap" },
      { title: "Former Students", href: "/students/former", resource: "student", icon: "UserMinus" },
      { title: "Alumni", href: "/students/alumni", resource: "student", icon: "Award" },
      { title: "Retained Students", href: "/students/retained", resource: "student", icon: "UserX" },
      { title: "Transfer Certificates", href: "/students/tc", resource: "student", icon: "FileText" },
      { title: "Classes", href: "/classes", resource: "class", icon: "School" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Fee Collection", href: "/fees", resource: "fee", icon: "CreditCard" },
      { title: "Fee Setup", href: "/fees/setup", resource: "fee", icon: "Settings" },
      { title: "Class Wise Fee Status", href: "/fees/class-wise-status", resource: "fee", icon: "Layers" },
      { title: "Pending Dues", href: "/fees/pending", resource: "fee", icon: "Clock" },
      { title: "Reports", href: "/fees/reports", resource: "fee", icon: "BarChart3" },
    ],
  },
  {
    label: "Academics",
    items: [
      { title: "Academic Sessions", href: "/academics", resource: "session", icon: "BookOpen" },
      { title: "Student Promotion", href: "/promotion", resource: "session", icon: "TrendingUp" },
      { title: "Attendance", href: "/attendance", resource: "attendance", icon: "CalendarCheck" },
      { title: "Results & Exams", href: "/results", resource: "result", icon: "NotebookPen" },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Notices", href: "/notices", resource: "notice", icon: "Megaphone" },
      { title: "Settings", href: "/settings", resource: "settings", icon: "Settings" },
    ],
  },
];

/** Flat list kept for any code that still maps a simple nav. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

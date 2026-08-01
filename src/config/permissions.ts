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

/** Default role grants (Principal gets all via code path). */
export const ROLE_DEFAULT_PERMISSIONS: Record<
  "ACCOUNTANT" | "TEACHER" | "STUDENT",
  PermissionKey[]
> = {
  ACCOUNTANT: [
    "dashboard.view",
    "admission.view",
    "admission.create",
    "admission.update",
    "admission.approve",
    "student.view",
    "student.create",
    "student.update",
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
  TEACHER: [
    "dashboard.view",
    "student.view",
    "class.view",
    "section.view",
    "subject.view",
    "attendance.view",
    "attendance.create",
    "attendance.update",
    "leave.view",
    "leave.create",
    "timetable.view",
    "exam.view",
    "marks.view",
    "marks.create",
    "marks.update",
    "homework.view",
    "homework.create",
    "homework.update",
    "document.view",
    "notice.view",
  ],
  STUDENT: [
    "dashboard.view",
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
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Documents", href: "/documents", resource: "document", icon: "FolderOpen" },
      { title: "Reports & Audits", href: "/reports", resource: "report", icon: "BarChart3" },
      { title: "Notices", href: "/notices", resource: "notice", icon: "Megaphone" },
      { title: "Settings", href: "/settings", resource: "settings", icon: "Settings" },
    ],
  },
];

/** Flat list kept for any code that still maps a simple nav. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

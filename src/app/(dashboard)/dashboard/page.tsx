import { requirePermission } from "@/server/permissions/guard";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { prisma } from "@/server/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { EmptyState } from "@/components/shared/states";

import { LucideIcon, GraduationCap, CalendarCheck, Coins, AlertCircle, BookOpen } from "lucide-react";

function Metric({
  label,
  value,
  subtext,
  icon: Icon,
  borderClass,
  iconColorClass,
  iconBgClass,
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: LucideIcon;
  borderClass: string;
  iconColorClass: string;
  iconBgClass: string;
}) {
  return (
    <div className={`rounded-xl border-l-4 ${borderClass} border-y border-r border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-between`}>
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-800 tracking-tight">{value}</p>
        <p className="text-[11px] text-slate-400 font-medium">{subtext}</p>
      </div>
      <div className={`p-3 rounded-xl ${iconBgClass}`}>
        <Icon className={`h-5 w-5 ${iconColorClass}`} />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const { user } = await requirePermission("dashboard.view");
  const schoolId = schoolIdFromUser(user);

  if (user.role === "STUDENT" && user.studentId) {
    const student = await prisma.student.findUnique({
      where: { id: user.studentId },
      include: {
        enrollments: {
          include: { class: true, section: true, session: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        studentFees: { include: { allocations: true } },
      },
    });

    const due =
      student?.studentFees.reduce((sum, f) => {
        const paid = f.allocations.reduce((s, a) => s + Number(a.amount), 0);
        return sum + Math.max(0, Number(f.amount) - paid);
      }, 0) ?? 0;

    const enrollment = student?.enrollments[0];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">My Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your academic overview</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric 
            label="Admission Number" 
            value={student?.admissionNo ?? "—"} 
            subtext="Unique student identifier"
            icon={GraduationCap}
            borderClass="border-l-indigo-500"
            iconBgClass="bg-indigo-50"
            iconColorClass="text-indigo-600"
          />
          <Metric
            label="Class / Section"
            value={
              enrollment ? `${enrollment.class.name} - ${enrollment.section.name}` : "—"
            }
            subtext="Assigned class group"
            icon={BookOpen}
            borderClass="border-l-teal-500"
            iconBgClass="bg-teal-50"
            iconColorClass="text-teal-600"
          />
          <Metric 
            label="Outstanding Dues" 
            value={formatCurrency(due)} 
            subtext="Pending fee payment amount"
            icon={Coins}
            borderClass="border-l-rose-500"
            iconBgClass="bg-rose-50"
            iconColorClass="text-rose-600"
          />
        </div>
      </div>
    );
  }

  const [students, attendanceToday, feesCollected, pendingFeeRows] = await Promise.all([
    prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.attendanceRecord.count({
      where: {
        date: new Date(new Date().toISOString().slice(0, 10)),
        student: { schoolId },
      },
    }),
    prisma.familyPayment.aggregate({
      where: { family: { schoolId } },
      _sum: { amount: true },
    }),
    prisma.studentFee.findMany({
      where: {
        student: { schoolId },
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      },
      include: { allocations: true },
    }),
  ]);

  const collected = Number(feesCollected._sum.amount ?? 0);
  const pending = pendingFeeRows.reduce((sum, f) => {
    const paid = f.allocations.reduce((s, a) => s + Number(a.amount), 0);
    return sum + Math.max(0, Number(f.amount) - paid);
  }, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back, {user.name}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric 
          label="Active Students" 
          value={students} 
          subtext="Currently enrolled in sessions"
          icon={GraduationCap}
          borderClass="border-l-emerald-500"
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
        />
        <Metric 
          label="Today's Attendance" 
          value={attendanceToday} 
          subtext="Student daily records entered"
          icon={CalendarCheck}
          borderClass="border-l-indigo-500"
          iconBgClass="bg-indigo-50"
          iconColorClass="text-indigo-600"
        />
        <Metric 
          label="Fees Collected" 
          value={formatCurrency(collected)} 
          subtext="All-time payment collection"
          icon={Coins}
          borderClass="border-l-amber-500"
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
        />
        <Metric 
          label="Fees Pending" 
          value={formatCurrency(pending)} 
          subtext="Awaiting invoice payments"
          icon={AlertCircle}
          borderClass="border-l-rose-500"
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
        />
      </div>

      {students === 0 ? (
        <EmptyState
          title="No students yet"
          description="Add families and students when you are ready. Counts stay at zero until real data exists."
        />
      ) : null}
    </div>
  );
}

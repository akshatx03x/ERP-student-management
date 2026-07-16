import { requirePermission } from "@/server/permissions/guard";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { prisma } from "@/server/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { EmptyState } from "@/components/shared/states";

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
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
          <h1 className="text-2xl font-semibold tracking-tight">My Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your academic overview</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Admission No" value={student?.admissionNo ?? "—"} />
          <Metric
            label="Class"
            value={
              enrollment ? `${enrollment.class.name} - ${enrollment.section.name}` : "—"
            }
          />
          <Metric label="Fees Remaining" value={formatCurrency(due)} />
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
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back, {user.name}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Students" value={students} />
        <Metric label="Attendance today" value={attendanceToday} />
        <Metric label="Fees collected" value={formatCurrency(collected)} />
        <Metric label="Fees pending" value={formatCurrency(pending)} />
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

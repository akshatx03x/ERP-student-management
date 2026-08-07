import { requirePermission } from "@/server/permissions/guard";
import { isPrincipal } from "@/server/auth/session";

import { prisma } from "@/server/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { EmptyState } from "@/components/shared/states";
import { BackupPanel } from "@/components/shared/backup-panel";
import { unstable_cache } from "next/cache";
import { SessionFilter } from "./session-filter";

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const { user } = await requirePermission("dashboard.view");

  // Gracefully handle users not linked to a school (e.g. manually registered accounts).
  // In desktop/offline mode the seed creates the principal account; other self-registered
  // accounts have no schoolId and should see a setup prompt rather than a 500 error.
  if (!user.schoolId || user.schoolId.trim() === "") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="max-w-md w-full rounded-xl border border-amber-200 bg-amber-50 p-8 shadow-sm text-center space-y-4">
          <div className="flex justify-center">
            <AlertCircle className="h-12 w-12 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-amber-900">Account Not Linked to a School</h1>
          <p className="text-sm text-amber-800">
            Your account <span className="font-semibold">{user.email}</span> is not linked to any school.
          </p>
          <p className="text-sm text-amber-700">
            Please sign out and log in with the <strong>Principal account</strong> created during setup:
          </p>
          <div className="rounded-lg bg-white border border-amber-200 p-4 text-left text-sm font-mono space-y-1">
            <p><span className="text-slate-500">Email:</span> <span className="font-semibold text-slate-800">principal@vidyanjali.edu</span></p>
            <p><span className="text-slate-500">Password:</span> <span className="font-semibold text-slate-800">Principal@123</span></p>
          </div>
          <p className="text-xs text-amber-600">
            If you changed these credentials, check your setup configuration.
          </p>
        </div>
      </div>
    );
  }

  const schoolId = user.schoolId;

  const sessions = await prisma.academicSession.findMany({
    where: { schoolId },
    orderBy: { startDate: "desc" },
  });
  const currentSession = sessions.find((s) => s.isCurrent) || sessions[0];
  const resolvedParams = await searchParams;
  const selectedSessionId = resolvedParams?.sessionId || currentSession?.id;

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

  const fetchCachedStats = unstable_cache(
    async (sId: string, sessId: string | undefined) => {
      const [students, feesCollected, pendingFeeRows] = await Promise.all([
        prisma.student.count({ where: { schoolId: sId, status: "ACTIVE" } }),
        prisma.feePaymentAllocation.aggregate({
          where: {
            student: { schoolId: sId },
            studentFee: sessId ? { sessionId: sessId } : undefined
          },
          _sum: { amount: true },
        }),
        prisma.studentFee.findMany({
          where: {
            student: { schoolId: sId },
            sessionId: sessId || undefined,
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

      return {
        students,
        collected,
        pending,
      };
    },
    [`dashboard-stats-${schoolId}-${selectedSessionId || "default"}`],
    { revalidate: 15, tags: [`dashboard-stats-${schoolId}`] }
  );

  const stats = await fetchCachedStats(schoolId, selectedSessionId);
  const { students, collected, pending } = stats;

  // Load last backup info for the Principal's dashboard (non-blocking)
  const principalView = isPrincipal(user.role);
  let lastBackup = null;
  if (principalView) {
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
      // Non-critical — don't fail the dashboard
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Welcome back, {user.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <SessionFilter sessions={sessions} selectedSessionId={selectedSessionId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
          label="Fees Collected" 
          value={formatCurrency(collected)} 
          subtext="Selected session payment collection"
          icon={Coins}
          borderClass="border-l-amber-500"
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
        />
        <Metric 
          label="Fees Pending" 
          value={formatCurrency(pending)} 
          subtext="Selected session pending payments"
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

      {/* Administrative Tools — visible only to Principal */}
      {principalView && (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-700">Administrative Tools</h2>
            <p className="text-xs text-slate-400 mt-0.5">System-level operations. Only visible to the Principal.</p>
          </div>
          <BackupPanel isPrincipal={true} lastBackup={lastBackup} />
        </div>
      )}
    </div>
  );
}

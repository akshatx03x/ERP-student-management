import { getReportsSummaryAction, listAuditLogsAction } from "@/server/actions/platform.actions";
import { PageHeader } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ReportsPrintButton } from "./reports-print-button";

export default async function ReportsPage() {
  const [summary, audits] = await Promise.all([
    getReportsSummaryAction(),
    listAuditLogsAction({ pageSize: 30 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Audit"
        description="Live aggregates. Use browser Print, or export via copy/print to PDF."
        actions={<ReportsPrintButton />}
      />

      <div id="report-print-area" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Students</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.students}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Fees collected</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{formatCurrency(summary.feesCollected)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Fees pending</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{formatCurrency(summary.pendingFees)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Payments</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.paymentCount}</CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Attendance by status</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {summary.attendance.length === 0 ? (
              <p className="text-muted-foreground">No attendance records yet.</p>
            ) : (
              summary.attendance.map((a) => (
                <div key={a.status} className="flex justify-between border-b py-1">
                  <span>{a.status}</span>
                  <span>{a._count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Admissions by status</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {summary.admissions.length === 0 ? (
              <p className="text-muted-foreground">No admissions yet.</p>
            ) : (
              summary.admissions.map((a) => (
                <div key={a.status} className="flex justify-between border-b py-1">
                  <span>{a.status}</span>
                  <span>{a._count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Audit log</CardTitle></CardHeader>
        <CardContent className="max-h-96 space-y-2 overflow-auto text-sm">
          {audits.items.map((log) => (
            <div key={log.id} className="rounded border px-3 py-2">
              <p className="font-medium">
                {log.module}.{log.action} · {log.entityType}
              </p>
              <p className="text-muted-foreground">
                {log.user?.name ?? "System"} · {formatDate(log.createdAt)}
                {log.ipAddress ? ` · ${log.ipAddress}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

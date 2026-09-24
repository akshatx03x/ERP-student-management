import Link from "next/link";
import { getReportsSummaryAction, listAuditLogsAction } from "@/server/actions/platform.actions";
import { PageHeader } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ReportsPrintButton } from "./reports-print-button";
import { ArrowUpRight, Layers, FileText, Landmark, Wallet } from "lucide-react";

export default async function ReportsPage() {
  const [summary, audits] = await Promise.all([
    getReportsSummaryAction(),
    listAuditLogsAction({ pageSize: 30 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Audit"
        description="Live aggregates and combined transaction stream. Use browser Print, or export via copy/print to PDF."
        actions={<ReportsPrintButton />}
      />

      <div id="report-print-area" className="space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="border-stone-200 shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Students</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{summary.students}</CardContent>
          </Card>

          <Card className="border-emerald-200/80 bg-emerald-50/20 shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-700">Fees Collected</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-emerald-800">
              {formatCurrency(summary.feesCollected)}
            </CardContent>
          </Card>

          <Card className="border-indigo-200/80 bg-indigo-50/20 shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-indigo-700">Amount in Wallet</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-indigo-800">
              {formatCurrency(summary.totalInWallet)}
            </CardContent>
          </Card>

          <Card className="border-rose-200/80 bg-rose-50/20 shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-700">Fees Pending</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-rose-800">
              {formatCurrency(summary.pendingFees)}
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Transactions</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-stone-900">
              {summary.totalTransactionCount.toLocaleString()}
            </CardContent>
          </Card>
        </div>

        {/* Total Transactions (Combo Register Section) */}
        <Card className="border-stone-200 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-stone-100 bg-stone-50/50 py-3.5 px-6">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" /> Total Transactions (Combo Register)
              </CardTitle>
              <CardDescription className="text-xs text-stone-500 mt-0.5">
                Combined real-time activity stream from Receipt Register, Cash Book, and Wallet Register
              </CardDescription>
            </div>
            <Link href="/fees/reports">
              <Button size="sm" variant="outline" className="h-8 text-xs font-semibold">
                View Full Finance Hub <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {summary.recentTransactions.length === 0 ? (
              <p className="p-6 text-center text-sm text-stone-400">No transactions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Register</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Reference</th>
                      <th className="py-2.5 px-4">Party / Student</th>
                      <th className="py-2.5 px-4">Method</th>
                      <th className="py-2.5 px-4 text-right">Inflow (+)</th>
                      <th className="py-2.5 px-4 text-right">Outflow (-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {summary.recentTransactions.map((tx) => (
                      <tr key={`${tx.register}-${tx.id}`} className="hover:bg-stone-50/50">
                        <td className="py-2.5 px-4 text-stone-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              tx.register === "RECEIPT"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : tx.register === "CASHBOOK"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-indigo-50 text-indigo-800 border-indigo-200"
                            }`}
                          >
                            {tx.register === "RECEIPT" ? "Receipt" : tx.register === "CASHBOOK" ? "Cash Book" : "Wallet"}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-stone-800">{tx.type}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-stone-700">{tx.ref}</td>
                        <td className="py-2.5 px-4 font-semibold text-stone-800 truncate max-w-[180px]">{tx.party}</td>
                        <td className="py-2.5 px-4 text-stone-600 font-medium">{tx.method}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">
                          {tx.flow === "INFLOW" ? `+${formatCurrency(tx.amount)}` : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-700">
                          {tx.flow === "OUTFLOW" ? `-${formatCurrency(tx.amount)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Breakdown grids */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm font-bold">Attendance by Status</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {summary.attendance.length === 0 ? (
                <p className="text-muted-foreground">No attendance records yet.</p>
              ) : (
                summary.attendance.map((a) => (
                  <div key={a.status} className="flex justify-between border-b py-1.5 text-xs">
                    <span className="font-semibold text-stone-700">{a.status}</span>
                    <span className="font-bold text-stone-900">{a._count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-bold">Admissions by Status</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {summary.admissions.length === 0 ? (
                <p className="text-muted-foreground">No admissions yet.</p>
              ) : (
                summary.admissions.map((a) => (
                  <div key={a.status} className="flex justify-between border-b py-1.5 text-xs">
                    <span className="font-semibold text-stone-700">{a.status}</span>
                    <span className="font-bold text-stone-900">{a._count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Audit Log */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-bold">Audit Log</CardTitle></CardHeader>
        <CardContent className="max-h-96 space-y-2 overflow-auto text-sm">
          {audits.items.map((log) => (
            <div key={log.id} className="rounded-lg border border-stone-200 px-3 py-2 bg-stone-50/40">
              <p className="font-medium text-stone-900 text-xs">
                {log.module}.{log.action} · {log.entityType}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
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

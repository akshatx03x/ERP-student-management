import { getPrincipalFinancialDashboardAction } from "@/server/actions/financial-reports.actions";
import { PageHeader } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { GlobalFinancialSearchBar } from "@/components/fee-reports/global-financial-search-bar";
import { ReportExportButton } from "@/components/fee-reports/report-export-button";
import { DollarSign, ShieldAlert, Users, Wallet, TrendingUp, AlertCircle } from "lucide-react";
import Link from "next/link";

export default async function PrincipalFinancialDashboardPage() {
  const dash = await getPrincipalFinancialDashboardAction();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="Principal Executive Financial Dashboard"
          description="High-level financial KPIs, collection trends, top defaulters list, and quick search"
        />
        <GlobalFinancialSearchBar />
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-emerald-950/30 border-emerald-800/40">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-400">Today's Collection</p>
            <p className="text-xl font-black text-emerald-300 mt-1">{formatCurrency(dash.todayCollection)}</p>
            <span className="text-[10px] text-slate-400">{dash.todayPaymentsCount} Transactions</span>
          </CardContent>
        </Card>

        <Card className="bg-rose-950/30 border-rose-800/40">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-rose-400">Total Outstanding</p>
            <p className="text-xl font-black text-rose-300 mt-1">{formatCurrency(dash.totalOutstanding)}</p>
          </CardContent>
        </Card>

        <Card className="bg-indigo-950/30 border-indigo-800/40">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-indigo-300">Family Wallet Balance</p>
            <p className="text-xl font-black text-indigo-200 mt-1">{formatCurrency(dash.walletBalance)}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-400">Active Discounts</p>
            <p className="text-lg font-bold text-emerald-300 mt-1">{formatCurrency(dash.totalDiscounts)}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-amber-400">Active Fines</p>
            <p className="text-lg font-bold text-amber-300 mt-1">{formatCurrency(dash.totalFines)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── TOP DEFAULTERS LIST ── */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400" /> Top Defaulters List
          </CardTitle>
          <ReportExportButton title="Top Defaulters" data={dash.topDefaulters} filename="top_defaulters" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                  <th className="p-3 font-semibold">Student Name</th>
                  <th className="p-3 font-semibold">Admission No</th>
                  <th className="p-3 font-semibold">Father Name</th>
                  <th className="p-3 font-semibold">Phone</th>
                  <th className="p-3 font-semibold text-rose-400">Total Overdue</th>
                  <th className="p-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {dash.topDefaulters.map((item: { studentId: string; studentName: string; admissionNo: string; fatherName: string | null; phone: string | null; totalOverdue: number }) => (
                  <tr key={item.studentId} className="hover:bg-slate-800/30">
                    <td className="p-3 font-bold text-slate-200">{item.studentName}</td>
                    <td className="p-3 font-mono text-slate-300">{item.admissionNo}</td>
                    <td className="p-3 text-slate-300">{item.fatherName}</td>
                    <td className="p-3 text-slate-400">{item.phone}</td>
                    <td className="p-3 font-black text-rose-300">{formatCurrency(item.totalOverdue)}</td>
                    <td className="p-3">
                      <Link
                        href={`/students/${item.studentId}`}
                        className="text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        View Financial Profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

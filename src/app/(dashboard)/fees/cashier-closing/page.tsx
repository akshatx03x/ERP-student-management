import { generateCashierDailyClosingAction } from "@/server/actions/financial-reports.actions";
import { PageHeader } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ReportExportButton } from "@/components/fee-reports/report-export-button";

export default async function CashierClosingPage() {
  const closing = await generateCashierDailyClosingAction();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="Cashier Daily Closing Sheet"
          description="Printable daily cash reconciliation and payment mode breakdown"
        />
        <ReportExportButton title="Cashier Closing Sheet" data={[closing]} filename="cashier_daily_closing" />
      </div>

      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl space-y-6 print:border-none print:p-0">
        <div className="border-b border-slate-800 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Vidhyanjali Public School</h2>
            <p className="text-sm text-slate-400">Daily Cashier Closing Statement</p>
          </div>
          <div className="text-right text-xs text-slate-300">
            <p>Date: <span className="font-bold text-white">{formatDate(closing.date)}</span></p>
            <p>Cashier: <span className="font-bold text-white">{closing.collectorName}</span></p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 font-medium">Cash Collected</span>
            <p className="text-xl font-bold text-emerald-300 mt-1">{formatCurrency(closing.cashAmount)}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 font-medium">UPI / Digital</span>
            <p className="text-xl font-bold text-indigo-300 mt-1">{formatCurrency(closing.upiAmount)}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 font-medium">Cheque</span>
            <p className="text-xl font-bold text-slate-200 mt-1">{formatCurrency(closing.chequeAmount)}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 font-medium">Bank Transfer</span>
            <p className="text-xl font-bold text-slate-200 mt-1">{formatCurrency(closing.bankTransferAmount)}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 font-medium">Wallet Settlement</span>
            <p className="text-xl font-bold text-indigo-200 mt-1">{formatCurrency(closing.walletSettlementAmount)}</p>
          </div>
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50">
            <span className="text-emerald-400 font-semibold">Net Collection</span>
            <p className="text-2xl font-black text-emerald-300 mt-1">{formatCurrency(closing.netCollection)}</p>
          </div>
        </div>

        {/* Signature Block for Print */}
        <div className="pt-12 border-t border-slate-800 flex justify-between text-xs text-slate-400 font-medium">
          <div>
            <div className="w-48 border-b border-slate-700 mb-1" />
            <p>Cashier Signature</p>
          </div>
          <div>
            <div className="w-48 border-b border-slate-700 mb-1" />
            <p>Accountant Verification</p>
          </div>
          <div>
            <div className="w-48 border-b border-slate-700 mb-1" />
            <p>Principal Approval</p>
          </div>
        </div>
      </div>
    </div>
  );
}

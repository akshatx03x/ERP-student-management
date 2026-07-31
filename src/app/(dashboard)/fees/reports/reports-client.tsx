"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Search, Download, FileText, Landmark, Wallet, BarChart3 } from "lucide-react";

type LedgerRow = {
  id: string; fullName: string; admissionNo: string;
  classLabel: string | null; fatherName: string | null;
  total: number; paid: number; remaining: number;
};
type PaymentRow = {
  id: string; receiptNo: string; amount: number; method: string;
  referenceNo: string | null; paidAt: Date | string; notes: string | null;
  allocations: Array<{ amount: number; studentName: string }>;
};
type WalletRow = {
  id: string; createdAt: Date | string; type: string; amount: number;
  balanceAfter: number; reason: string; family: { fatherName?: string | null };
};

export function ReportsClient({
  ledgerRows,
  paymentRows,
  walletRows,
}: {
  ledgerRows: LedgerRow[];
  paymentRows: PaymentRow[];
  walletRows: WalletRow[];
}) {
  const [activeReportTab, setActiveReportTab] = useState<"ledger" | "collection" | "wallet">("ledger");
  const [search, setSearch] = useState("");

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ledgerRows;
    return ledgerRows.filter(r =>
      `${r.fullName} ${r.admissionNo} ${r.classLabel ?? ""}`.toLowerCase().includes(q)
    );
  }, [ledgerRows, search]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return paymentRows;
    return paymentRows.filter(p =>
      `${p.receiptNo} ${p.notes ?? ""}`.toLowerCase().includes(q) ||
      p.allocations.some(a => a.studentName.toLowerCase().includes(q))
    );
  }, [paymentRows, search]);

  const filteredWallets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return walletRows;
    return walletRows.filter(w =>
      `${w.reason} ${w.family?.fatherName ?? ""}`.toLowerCase().includes(q)
    );
  }, [walletRows, search]);

  function handleExport() {
    let header = "";
    let body = "";
    let filename = "";

    if (activeReportTab === "ledger") {
      header = "Name,Admission No,Class,Total Charged,Total Paid,Balance\n";
      body = filteredLedger.map(r => `"${r.fullName}","${r.admissionNo}","${r.classLabel || ""}",${r.total},${r.paid},${r.remaining}`).join("\n");
      filename = "ledger-book.csv";
    } else if (activeReportTab === "collection") {
      header = "Date,Receipt No,Mode,Allocations,Total Amount\n";
      body = filteredPayments.map(p => `"${formatDate(p.paidAt)}","${p.receiptNo}","${p.method}","${p.allocations.map(a => `${a.studentName} (${a.amount})`).join("; ")}",${p.amount}`).join("\n");
      filename = "collection-trail.csv";
    } else {
      header = "Date,Type,Amount,Balance After,Reason\n";
      body = filteredWallets.map(w => `"${formatDate(w.createdAt)}","${w.type}",${w.amount},${w.balanceAfter},"${w.reason}"`).join("\n");
      filename = "wallet-log.csv";
    }

    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[calc(100vh-220px)] max-w-[1440px] mx-auto text-sm">
      {/* TABS HEADER */}
      <div className="bg-stone-50 border-b border-stone-200 px-5 py-3 flex justify-between items-center shrink-0">
        <div className="flex gap-2">
          {[
            { id: "ledger", label: "Ledger Book", icon: BarChart3 },
            { id: "collection", label: "Collection Trail", icon: Landmark },
            { id: "wallet", label: "Wallet Advance Log", icon: Wallet },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveReportTab(tab.id as any); setSearch(""); }}
              className={cn("flex items-center gap-2 px-4.5 py-2 text-sm font-extrabold rounded-lg transition-all",
                activeReportTab === tab.id ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-250/50")}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} className="h-9 text-xs font-semibold border-stone-300 rounded-lg">
          <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
        </Button>
      </div>

      {/* FILTER BAR */}
      <div className="border-b border-stone-200 px-5 py-3 bg-stone-50/50 shrink-0">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search report logs…" className="pl-9 h-9 text-xs bg-white rounded-lg border-stone-350" />
        </div>
      </div>

      {/* RENDER ACTIVE TAB TABLE */}
      <div className="flex-1 overflow-y-auto">
        {activeReportTab === "ledger" && (
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Admission No</th>
                <th className="py-3 px-4">Class</th>
                <th className="py-3 px-4 text-right">Total Charged</th>
                <th className="py-3 px-4 text-right text-emerald-700">Collected</th>
                <th className="py-3 px-4 text-right text-rose-700">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150">
              {filteredLedger.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-stone-400">No ledger logs found</td></tr>
              ) : (
                filteredLedger.map(r => (
                  <tr key={r.id} className="hover:bg-stone-50/30">
                    <td className="py-3 px-4 font-bold text-stone-900">{r.fullName}</td>
                    <td className="py-3 px-4 font-mono text-stone-600">{r.admissionNo}</td>
                    <td className="py-3 px-4">{r.classLabel || "—"}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(r.total)}</td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-700">{formatCurrency(r.paid)}</td>
                    <td className={cn("py-3 px-4 text-right font-mono font-bold", r.remaining > 0 ? "text-rose-700" : "text-emerald-750")}>
                      {formatCurrency(r.remaining)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeReportTab === "collection" && (
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Receipt No</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4">Allocated Students</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150">
              {filteredPayments.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-stone-400">No collection records found</td></tr>
              ) : (
                filteredPayments.map(p => (
                  <tr key={p.id} className="hover:bg-stone-50/30">
                    <td className="py-3 px-4 text-stone-600">{formatDate(p.paidAt)}</td>
                    <td className="py-3 px-4 font-bold text-indigo-700">{p.receiptNo}</td>
                    <td className="py-3 px-4"><Badge variant="outline" className="rounded-md">{p.method}</Badge></td>
                    <td className="py-3 px-4 text-stone-600">
                      {p.allocations.map(a => `${a.studentName} (${formatCurrency(a.amount)})`).join(", ")}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{formatCurrency(p.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeReportTab === "wallet" && (
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Adjusted Amount</th>
                <th className="py-3 px-4 text-right">Wallet Balance</th>
                <th className="py-3 px-4">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150">
              {filteredWallets.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-stone-400">No advance wallet trails found</td></tr>
              ) : (
                filteredWallets.map(w => {
                  const isCredit = w.type.includes("CREDIT");
                  return (
                    <tr key={w.id} className="hover:bg-stone-50/30">
                      <td className="py-3 px-4 text-stone-600">{formatDate(w.createdAt)}</td>
                      <td className="py-3 px-4"><Badge variant={isCredit ? "success" : "secondary"} className="rounded-md">{w.type}</Badge></td>
                      <td className={cn("py-3 px-4 text-right font-mono font-bold", isCredit ? "text-emerald-700" : "text-rose-700")}>
                        {isCredit ? "+" : "-"}{formatCurrency(w.amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">{formatCurrency(w.balanceAfter)}</td>
                      <td className="py-3 px-4 text-stone-600">{w.reason}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

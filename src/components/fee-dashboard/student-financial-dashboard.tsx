"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  History,
  Layers,
  Percent,
  Printer,
  ShieldAlert,
  Users,
  Wallet,
  ChevronDown,
  ChevronRight,
  FileText,
  X,
} from "lucide-react";
import { getReceiptAction } from "@/server/actions/fee.actions";
import { toast } from "sonner";

interface DashboardProps {
  profile: any;
  userRole: string;
}

export function StudentFinancialDashboard({ profile }: DashboardProps) {
  const [activeTab, setActiveTab] = useState("matrix");
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const {
    student,
    summary,
    monthlyMatrix,
    paymentHistory,
    walletHistory,
    discounts,
    fines,
    siblings,
    auditTimeline,
  } = profile;

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const handlePrint = () => {
    window.print();
  };

  const tabs = [
    { id: "matrix", label: "Month Accordion Fee Card", icon: Layers, count: null },
    { id: "payments", label: "Payment Register", icon: CreditCard, count: paymentHistory.length },
    { id: "wallet", label: "Wallet Ledger", icon: Wallet, count: walletHistory.length },
    { id: "discounts", label: "Concessions", icon: Percent, count: discounts.length },
    { id: "fines", label: "Late Fees", icon: ShieldAlert, count: fines.length },
    { id: "family", label: "Family View", icon: Users, count: siblings.length },
    { id: "audit", label: "Audit Stream", icon: History, count: null },
  ];

  return (
    <div className="space-y-4 font-sans text-stone-900 bg-stone-50/50 p-1 rounded-xl">
      {/* ── HEADER: STUDENT PROFILE SUMMARY BAR ── */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center font-extrabold text-xl text-indigo-700">
            {student.fullName.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-stone-900">{student.fullName}</h2>
              <Badge variant="outline" className="font-bold text-[10px]">
                {student.status}
              </Badge>
            </div>
            <p className="text-xs text-stone-600">
              Adm No: <span className="font-bold">{student.admissionNo}</span> · Class:{" "}
              <span className="font-bold">{student.currentEnrollment?.label || "Unassigned"}</span> · Parent:{" "}
              <span className="font-semibold">{student.family.fatherName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-stone-100 border border-stone-200 rounded-lg px-3 py-1 text-xs">
            <span className="text-stone-500 block text-[9px] uppercase font-bold">Total Annual Fee</span>
            <span className="font-bold text-stone-800">{formatCurrency(summary.totalAnnualFee)}</span>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1 text-xs text-emerald-800">
            <span className="text-emerald-600 block text-[9px] uppercase font-bold">Total Paid</span>
            <span className="font-bold">{formatCurrency(summary.totalPaid)}</span>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-1 text-xs text-rose-800">
            <span className="text-rose-600 block text-[9px] uppercase font-bold">Net Remaining</span>
            <span className="font-extrabold text-sm">{formatCurrency(summary.totalRemaining)}</span>
          </div>

          <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs font-bold gap-1.5 no-print">
            <Printer className="w-3.5 h-3.5" /> Print Fee Card
          </Button>
        </div>
      </div>

      {/* ── TAB NAVIGATION BAR ── */}
      <div className="bg-white border border-stone-200 rounded-xl p-1 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1 border-b border-stone-200 pb-1 text-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? "bg-indigo-800 text-white" : "bg-stone-200 text-stone-700"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: MONTH-WISE ACCORDION ── */}
        {activeTab === "matrix" && (
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-bold text-stone-500 uppercase tracking-wider pb-2 border-b">
              <span>Academic Session Fee Matrix</span>
              <span>Net Due: {formatCurrency(summary.totalNetPayable)}</span>
            </div>

            {monthlyMatrix.map((m: any) => {
              const isExpanded = !!expandedMonths[m.month];
              const hasDue = m.remaining > 0;

              return (
                <div
                  key={m.month}
                  className={`border rounded-xl transition-all overflow-hidden bg-white shadow-2xs ${
                    hasDue ? "border-rose-200" : "border-stone-200"
                  }`}
                >
                  {/* Month Accordion Bar */}
                  <div
                    onClick={() => toggleMonth(m.month)}
                    className={`px-4 py-3 cursor-pointer flex flex-wrap items-center justify-between gap-3 transition-colors ${
                      hasDue ? "bg-rose-50/40 hover:bg-rose-50/70" : "hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-stone-700" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-stone-700" />
                      )}
                      <div>
                        <span className="font-extrabold text-sm text-stone-900">{m.monthName}</span>
                        {m.dueDate && (
                          <span className="ml-2 text-[11px] text-stone-500 font-medium">
                            (Due: {formatDate(m.dueDate)})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <div className="text-stone-600">
                        Charged: <span className="font-mono">{formatCurrency(m.originalAmount)}</span>
                      </div>

                      {m.discountAmount > 0 && (
                        <div className="text-emerald-700">
                          Discount: <span className="font-mono">-{formatCurrency(m.discountAmount)}</span>
                        </div>
                      )}

                      {m.finalFine > 0 && (
                        <div className="text-amber-700">
                          Fine: <span className="font-mono">+{formatCurrency(m.finalFine)}</span>
                        </div>
                      )}

                      <div className="text-stone-800">
                        Paid: <span className="font-mono text-emerald-700">{formatCurrency(m.paidAmount)}</span>
                      </div>

                      <div className={`font-bold text-sm ${hasDue ? "text-rose-700" : "text-emerald-700"}`}>
                        Remaining: <span className="font-mono">{formatCurrency(m.remaining)}</span>
                      </div>

                      <Badge
                        variant={
                          m.status === "PAID"
                            ? "success"
                            : m.status === "PARTIAL"
                            ? "secondary"
                            : m.status === "OVERDUE"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[10px] uppercase font-bold"
                      >
                        {m.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Expanded Breakdown */}
                  {isExpanded && (
                    <div className="border-t border-stone-200 bg-stone-50/50 p-3">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px]">
                            <th className="py-2 px-3">Fee Head</th>
                            <th className="py-2 px-3">Charged Amount</th>
                            <th className="py-2 px-3 text-emerald-700">Concession</th>
                            <th className="py-2 px-3 text-amber-700">Late Fine</th>
                            <th className="py-2 px-3">Net Payable</th>
                            <th className="py-2 px-3 text-emerald-700">Paid</th>
                            <th className="py-2 px-3 text-rose-700">Outstanding</th>
                            <th className="py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-200/60 bg-white">
                          {m.items.map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-stone-50">
                              <td className="py-2 px-3 font-bold text-stone-800">{item.feeHeadName}</td>
                              <td className="py-2 px-3 font-mono">{formatCurrency(item.originalAmount)}</td>
                              <td className="py-2 px-3 font-mono text-emerald-700">
                                {item.discountAmount > 0 ? `-${formatCurrency(item.discountAmount)}` : "—"}
                              </td>
                              <td className="py-2 px-3 font-mono text-amber-700">
                                {item.finalFine > 0 ? `+${formatCurrency(item.finalFine)}` : "—"}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-stone-900">
                                {formatCurrency(item.originalAmount - item.discountAmount + item.finalFine)}
                              </td>
                              <td className="py-2 px-3 font-mono text-emerald-700">{formatCurrency(item.paidAmount)}</td>
                              <td className="py-2 px-3 font-mono font-bold text-rose-700">{formatCurrency(item.remaining)}</td>
                              <td className="py-2 px-3">
                                <Badge
                                  variant={
                                    item.status === "PAID"
                                      ? "success"
                                      : item.status === "PARTIAL"
                                      ? "secondary"
                                      : item.status === "OVERDUE"
                                      ? "destructive"
                                      : "outline"
                                  }
                                  className="text-[9px] uppercase font-bold"
                                >
                                  {item.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB 2: PAYMENT REGISTER ── */}
        {activeTab === "payments" && (
          <div className="p-4 space-y-3">
            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 border-b border-stone-200 font-bold uppercase text-[10px] text-stone-600">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Receipt No</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Recorded By</th>
                    <th className="py-2.5 px-3">Allocations</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {paymentHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-stone-500">
                        No payments recorded yet for this student.
                      </td>
                    </tr>
                  ) : (
                    paymentHistory.map((p: any) => (
                      <tr key={p.id} className="hover:bg-stone-50">
                        <td className="py-2.5 px-3 font-medium">{formatDate(p.paidAt)}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{p.receiptNo}</td>
                        <td className="py-2.5 px-3"><Badge variant="outline" className="font-bold">{p.method}</Badge></td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{formatCurrency(p.amount)}</td>
                        <td className="py-2.5 px-3 text-stone-600">{p.recordedBy || "System"}</td>
                        <td className="py-2.5 px-3 text-stone-600">
                          {p.allocations.map((a: any, idx: number) => (
                            <span key={idx} className="block text-[11px]">
                              {a.feeHead}: {formatCurrency(a.amount)}
                            </span>
                          ))}
                        </td>
                        <td className="py-2.5 px-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                const r = await getReceiptAction(p.id);
                                setSelectedReceipt(r.snapshot);
                              } catch {
                                toast.error("Failed to load receipt");
                              }
                            }}
                            className="h-7 text-[11px] font-semibold gap-1"
                          >
                            <FileText className="w-3 h-3 text-indigo-600" /> Receipt
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: WALLET LEDGER ── */}
        {activeTab === "wallet" && (
          <div className="p-4 space-y-3">
            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 border-b border-stone-200 font-bold uppercase text-[10px] text-stone-600">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-right">Balance After</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {walletHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-stone-500">
                        No wallet transactions recorded.
                      </td>
                    </tr>
                  ) : (
                    walletHistory.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-stone-50">
                        <td className="py-2.5 px-3 font-medium">{formatDate(tx.createdAt)}</td>
                        <td className="py-2.5 px-3">
                          <Badge variant={tx.type.includes("CREDIT") ? "success" : "secondary"}>
                            {tx.type}
                          </Badge>
                        </td>
                        <td className={`py-2.5 px-3 font-mono font-bold text-right ${tx.type.includes("CREDIT") ? "text-emerald-700" : "text-rose-700"}`}>
                          {tx.type.includes("CREDIT") ? "+" : "-"}{formatCurrency(tx.amount)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-right">{formatCurrency(tx.balanceAfter)}</td>
                        <td className="py-2.5 px-3 text-stone-600">{tx.reason}</td>
                        <td className="py-2.5 px-3 text-stone-600">{tx.recordedBy || "System"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 4: DISCOUNTS ── */}
        {activeTab === "discounts" && (
          <div className="p-4 space-y-3">
            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 border-b border-stone-200 font-bold uppercase text-[10px] text-stone-600">
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Value</th>
                    <th className="py-2.5 px-3">Fee Head</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">Approved By</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {discounts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-stone-500">
                        No active or past discounts granted to this student.
                      </td>
                    </tr>
                  ) : (
                    discounts.map((d: any) => (
                      <tr key={d.id} className="hover:bg-stone-50">
                        <td className="py-2.5 px-3 font-bold text-emerald-700">{d.category}</td>
                        <td className="py-2.5 px-3 font-bold font-mono">
                          {d.discountType === "PERCENTAGE" ? `${d.value}%` : formatCurrency(d.value)}
                        </td>
                        <td className="py-2.5 px-3 font-medium">{d.feeHeadName}</td>
                        <td className="py-2.5 px-3 text-stone-600">{d.reason}</td>
                        <td className="py-2.5 px-3 text-stone-600">{d.approvedBy || "System"}</td>
                        <td className="py-2.5 px-3">
                          <Badge variant={d.status === "ACTIVE" ? "success" : "destructive"}>
                            {d.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 5: FINES ── */}
        {activeTab === "fines" && (
          <div className="p-4 space-y-3">
            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 border-b border-stone-200 font-bold uppercase text-[10px] text-stone-600">
                    <th className="py-2.5 px-3">Fee Head</th>
                    <th className="py-2.5 px-3">Rule</th>
                    <th className="py-2.5 px-3">Calculated</th>
                    <th className="py-2.5 px-3 text-emerald-700">Waived</th>
                    <th className="py-2.5 px-3 text-amber-700">Final Fine</th>
                    <th className="py-2.5 px-3 text-emerald-700">Paid</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {fines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-stone-500">
                        No late fee fines assessed.
                      </td>
                    </tr>
                  ) : (
                    fines.map((f: any) => (
                      <tr key={f.id} className="hover:bg-stone-50">
                        <td className="py-2.5 px-3 font-bold text-stone-800">{f.feeHeadName}</td>
                        <td className="py-2.5 px-3 text-stone-600">{f.ruleName}</td>
                        <td className="py-2.5 px-3 font-mono">{formatCurrency(f.calculatedAmount)}</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700">
                          {f.waivedAmount > 0 ? `-${formatCurrency(f.waivedAmount)}` : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-700">{formatCurrency(f.finalAmount)}</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700">{formatCurrency(f.paidAmount)}</td>
                        <td className="py-2.5 px-3">
                          <Badge
                            variant={
                              f.status === "PAID"
                                ? "success"
                                : f.status === "WAIVED"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {f.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 6: FAMILY VIEW ── */}
        {activeTab === "family" && (
          <div className="p-4 space-y-3">
            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 border-b border-stone-200 font-bold uppercase text-[10px] text-stone-600">
                    <th className="py-2.5 px-3">Sibling Name</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Total Fee</th>
                    <th className="py-2.5 px-3 text-emerald-700">Discounts</th>
                    <th className="py-2.5 px-3 text-amber-700">Fines</th>
                    <th className="py-2.5 px-3 text-emerald-700">Paid</th>
                    <th className="py-2.5 px-3 text-rose-700">Net Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {siblings.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-stone-500">
                        No active siblings registered under this family profile.
                      </td>
                    </tr>
                  ) : (
                    siblings.map((s: any) => (
                      <tr key={s.id} className="hover:bg-stone-50">
                        <td className="py-2.5 px-3 font-bold text-stone-900">{s.fullName}</td>
                        <td className="py-2.5 px-3 text-stone-600">{s.classLabel}</td>
                        <td className="py-2.5 px-3 font-mono">{formatCurrency(s.totalFee)}</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700">-{formatCurrency(s.discounts)}</td>
                        <td className="py-2.5 px-3 font-mono text-amber-700">+{formatCurrency(s.fines)}</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700">{formatCurrency(s.paid)}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-rose-700">{formatCurrency(s.remaining)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 7: AUDIT STREAM ── */}
        {activeTab === "audit" && (
          <div className="p-4 space-y-2">
            {auditTimeline.length === 0 ? (
              <div className="p-6 text-center text-stone-500 text-xs">No audit logs recorded.</div>
            ) : (
              auditTimeline.map((item: any) => (
                <div key={item.id} className="p-3 rounded-lg border border-stone-200 bg-white text-xs flex justify-between items-start">
                  <div>
                    <span className="font-bold text-indigo-700 uppercase tracking-wide">{item.entityType} • {item.action}</span>
                    <p className="text-stone-600 mt-0.5">User: {item.user}</p>
                  </div>
                  <span className="text-[11px] text-stone-400 font-mono">{formatDate(item.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between no-print border-b pb-3">
              <h3 className="text-sm font-bold text-stone-900">Official Fee Receipt</h3>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => window.print()} className="bg-stone-900 text-white h-7 text-xs gap-1">
                  <Printer className="w-3.5 h-3.5" /> Print
                </Button>
                <button onClick={() => setSelectedReceipt(null)} className="text-stone-400 hover:text-stone-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="border border-stone-300 rounded-xl p-6 bg-white text-black font-sans text-xs space-y-4">
              <div className="text-center border-b pb-3">
                <h2 className="text-lg font-black uppercase text-stone-900">
                  {selectedReceipt.branding?.schoolName || "Vidyanjali Public School"}
                </h2>
                <p className="text-[10px] uppercase font-bold tracking-wider text-stone-600 mt-1">FEE RECEIPT</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-stone-700 text-[11px]">
                <p><span className="font-bold">Receipt No:</span> {selectedReceipt.receiptNo}</p>
                <p className="text-right"><span className="font-bold">Date:</span> {formatDate(selectedReceipt.paidAt)}</p>
                <p><span className="font-bold">Mode:</span> {selectedReceipt.method}</p>
              </div>

              <table className="w-full text-left border-collapse border-y border-stone-200">
                <thead>
                  <tr className="bg-stone-100 text-[10px] font-bold uppercase text-stone-700">
                    <th className="py-2 px-2">Student Name</th>
                    <th className="py-2 px-2">Fee Head</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(selectedReceipt.allocations || []).map((a: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-2 px-2 font-bold">{a.studentName} ({a.admissionNo})</td>
                      <td className="py-2 px-2">{a.feeHead}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold">{formatCurrency(a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-between items-center pt-2 font-bold text-sm">
                <span>Total Amount Paid:</span>
                <span className="font-mono text-base">{formatCurrency(selectedReceipt.amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

export function MonthWiseFeeDetailsClient({
  lines,
}: {
  lines: Array<{
    id: string;
    dueDate: Date | string | null;
    amount: number;
    paidAmount: number;
    remaining: number;
    status: string;
    feeHead?: { name: string } | null;
    discountAmount?: number;
    calculatedFine?: number;
  }>;
}) {
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const toggleMonth = (monthName: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [monthName]: !prev[monthName],
    }));
  };

  // Group ledger lines by Month name
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const grouped = lines.reduce((acc: any, curr: any) => {
    const m = curr.dueDate ? monthNames[new Date(curr.dueDate).getMonth()] : "One-Time";
    if (!acc[m]) {
      acc[m] = {
        month: m,
        expected: 0,
        paid: 0,
        pending: 0,
        items: [],
      };
    }
    acc[m].expected += curr.amount;
    acc[m].paid += curr.paidAmount;
    acc[m].pending += curr.remaining;
    acc[m].items.push(curr);
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      {Object.values(grouped).map((monthSum: any) => {
        const isExpanded = !!expandedMonths[monthSum.month];
        return (
          <div key={monthSum.month} className="border border-stone-200 rounded-lg overflow-hidden bg-white shadow-xs">
            <button
              onClick={() => toggleMonth(monthSum.month)}
              type="button"
              className="w-full flex items-center justify-between p-3 text-left hover:bg-stone-50 transition-colors text-xs font-bold text-stone-850"
            >
              <div className="flex items-center gap-1.5">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span>{monthSum.month}</span>
              </div>
              <div className="flex gap-4 font-mono text-[10px] text-stone-500">
                <span>Exp: <strong className="text-stone-900">{formatCurrency(monthSum.expected)}</strong></span>
                <span>Paid: <strong className="text-emerald-700">{formatCurrency(monthSum.paid)}</strong></span>
                <span>Pend: <strong className="text-rose-700">{formatCurrency(monthSum.pending)}</strong></span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-stone-100 p-3 bg-stone-50/50 space-y-2 text-xs">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-stone-500 font-bold uppercase text-[9px] border-b pb-1">
                      <th className="pb-1.5">Fee Head</th>
                      <th className="pb-1.5 text-right">Expected</th>
                      <th className="pb-1.5 text-right">Discount</th>
                      <th className="pb-1.5 text-right">Late Fine</th>
                      <th className="pb-1.5 text-right text-emerald-700">Paid</th>
                      <th className="pb-1.5 text-right text-rose-700 font-extrabold">Pending</th>
                      <th className="pb-1.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-150">
                    {monthSum.items.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-stone-100/30">
                        <td className="py-1.5 font-bold text-stone-800">{item.feeHead?.name || "Other"}</td>
                        <td className="py-1.5 text-right font-mono">{formatCurrency(item.originalAmount || item.amount)}</td>
                        <td className="py-1.5 text-right font-mono text-emerald-650">{formatCurrency(item.discountAmount || 0)}</td>
                        <td className="py-1.5 text-right font-mono text-amber-700">{formatCurrency(item.calculatedFine || 0)}</td>
                        <td className="py-1.5 text-right font-mono text-emerald-700">{formatCurrency(item.paidAmount)}</td>
                        <td className="py-1.5 text-right font-mono text-rose-700 font-extrabold">{formatCurrency(item.remaining)}</td>
                        <td className="py-1.5 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-extrabold ${item.status === 'PAID' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                            {item.status}
                          </span>
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
  );
}

import { requirePermission } from "@/server/permissions/guard";
import { listStudents } from "@/server/services/student.service";
import { listStudentFees, listPayments } from "@/server/services/fee.service";
import { prisma } from "@/server/lib/prisma";
import { decimalToNumber } from "@/server/lib/helpers";
import { ReportsClient } from "./reports-client";

export default async function ReportsHubPage() {
  await requirePermission("fee.view");

  const [students, fees, payments, walletTransactions] = await Promise.all([
    listStudents({ pageSize: 500 }),
    listStudentFees({ pageSize: 500 }),
    listPayments({ pageSize: 105 }),
    prisma.advanceTransaction.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      include: {
        family: { select: { fatherName: true } },
      },
    }),
  ]);

  // Aggregate outstanding dues for Ledger Book tab
  const feeMap = new Map<string, { total: number; paid: number; remaining: number }>();
  for (const f of fees.items) {
    const existing = feeMap.get(f.student.id) ?? { total: 0, paid: 0, remaining: 0 };
    existing.total += f.amount;
    existing.paid += f.paidAmount;
    existing.remaining += f.balance;
    feeMap.set(f.student.id, existing);
  }

  const ledgerRows = students.items.map((s: any) => {
    const agg = feeMap.get(s.id) ?? { total: 0, paid: 0, remaining: 0 };
    return {
      id: s.id,
      fullName: s.fullName,
      admissionNo: s.admissionNo,
      classLabel: s.enrollments?.[0] ? `${s.enrollments[0].class.name}-${s.enrollments[0].section.name}` : null,
      fatherName: s.family?.fatherName ?? null,
      total: agg.total,
      paid: agg.paid,
      remaining: agg.remaining,
    };
  });

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-stone-900">Reports Hub</h1>
        <p className="text-sm text-stone-500 mt-0.5">Centralized school accounts reports — ledger logs, collection trails, and cashier balances</p>
      </div>
      <ReportsClient
        ledgerRows={ledgerRows}
        paymentRows={payments.items.map((p: any) => ({
          id: p.id,
          receiptNo: p.receiptNo,
          amount: p.amount,
          method: p.method,
          referenceNo: p.referenceNo,
          paidAt: p.paidAt,
          notes: p.notes,
          allocations: p.allocations.map((a: any) => ({
            amount: a.amount,
            studentName: a.student.fullName,
          })),
        }))}
        walletRows={walletTransactions.map((tx: any) => ({
          id: tx.id,
          createdAt: tx.createdAt,
          type: tx.type,
          amount: decimalToNumber(tx.amount),
          balanceAfter: decimalToNumber(tx.balanceAfter),
          reason: tx.reason,
          family: {
            fatherName: tx.family.fatherName,
          },
        }))}
      />
    </div>
  );
}

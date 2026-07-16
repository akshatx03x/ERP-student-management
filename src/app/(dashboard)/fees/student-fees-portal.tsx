"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getReceiptAction } from "@/server/actions/fee.actions";

type PortalData = {
  currentClass: {
    className: string;
    sectionName: string;
    sessionName: string;
    label: string;
  } | null;
  feeStructure: {
    name: string;
    items: Array<{ feeHead: string; amount: number }>;
    totalAnnualFee: number;
  } | null;
  totalFee: number;
  paid: number;
  remaining: number;
  lines: Array<{
    feeHead: string;
    amount: number;
    paidAmount: number;
    remaining: number;
    status: string;
  }>;
  paymentHistory: Array<{
    date: Date | string;
    amount: number;
    method: string;
    referenceNo: string | null;
    remarks: string | null;
    receiptNo: string;
    paymentId: string;
  }>;
  siblings: Array<{
    fullName: string;
    classLabel: string;
    remainingFee: number;
  }>;
};

export function StudentFeesPortal({ data }: { data: PortalData }) {
  const [pending, startTransition] = useTransition();
  const [receipt, setReceipt] = useState<unknown>(null);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current class
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{data.currentClass?.label ?? "—"}</p>
            {data.currentClass ? (
              <p className="text-sm text-muted-foreground">{data.currentClass.sessionName}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total fee
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatCurrency(data.totalFee)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paid amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatCurrency(data.paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Remaining amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatCurrency(data.remaining)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fee structure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!data.feeStructure && data.lines.length === 0 ? (
            <p className="text-muted-foreground">No fee structure attached yet.</p>
          ) : (
            <>
              {(data.feeStructure?.items ?? data.lines.map((l) => ({
                feeHead: l.feeHead,
                amount: l.amount,
              }))).map((item, i) => (
                <div
                  key={i}
                  className="flex justify-between rounded border px-3 py-2"
                >
                  <span>{item.feeHead}</span>
                  <span>{formatCurrency(item.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 pt-2 font-medium">
                <span>Total annual fee</span>
                <span>
                  {formatCurrency(
                    data.feeStructure?.totalAnnualFee ?? data.totalFee,
                  )}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history & receipts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.paymentHistory.length === 0 ? (
            <p className="text-muted-foreground">No payments recorded yet.</p>
          ) : (
            data.paymentHistory.map((p) => (
              <div
                key={p.paymentId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
              >
                <div>
                  <p className="font-medium">
                    {formatCurrency(p.amount)} · {p.method}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDate(p.date)}
                    {p.referenceNo ? ` · Ref ${p.referenceNo}` : ""}
                    {p.remarks ? ` · ${p.remarks}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{p.receiptNo}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          const r = await getReceiptAction(p.paymentId);
                          setReceipt(r.snapshot);
                          toast.success("Receipt loaded");
                          setTimeout(() => window.print(), 300);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed");
                        }
                      })
                    }
                  >
                    Receipt
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {data.siblings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sibling information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Quick reference only — remaining fee for siblings in your family.
            </p>
            {data.siblings.map((s, i) => (
              <div
                key={i}
                className="flex justify-between rounded border px-3 py-2"
              >
                <div>
                  <p className="font-medium">{s.fullName}</p>
                  <p className="text-muted-foreground">{s.classLabel}</p>
                </div>
                <p>
                  Remaining fee{" "}
                  <span className="font-medium">{formatCurrency(s.remainingFee)}</span>
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {receipt ? (
        <div className="print-only rounded border bg-white p-6 text-black">
          <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(receipt, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}

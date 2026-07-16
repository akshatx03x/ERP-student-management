"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  createFeeHeadAction,
  createFeeStructureAction,
  updateFeeStructureAction,
  recordPaymentAction,
  getReceiptAction,
  getFamilyFeeDuesAction,
} from "@/server/actions/fee.actions";

type Head = { id: string; name: string; frequency: string };
type Fee = {
  id: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: string;
  student: { id: string; fullName: string; admissionNo: string; familyId: string };
  feeHead: { name: string };
  session: { name: string };
};
type Payment = {
  id: string;
  receiptNo: string;
  amount: number;
  method: string;
  referenceNo: string | null;
  notes: string | null;
  paidAt: Date | string;
  family: { fatherName?: string | null; motherName?: string | null };
  allocations: Array<{
    amount: number;
    student: { fullName: string };
  }>;
};
type Family = {
  id: string;
  familyCode: string | null;
  fatherName: string | null;
  motherName: string | null;
  primaryPhone: string | null;
};
type Student = { id: string; fullName: string; admissionNo: string; familyId: string };
type Session = { id: string; name: string };
type ClassRow = { id: string; name: string };
type Structure = {
  id: string;
  name: string;
  sessionId: string;
  classId: string;
  totalAnnualFee: number;
  class: { name: string };
  session: { name: string };
  items: Array<{ feeHeadId: string; amount: number; feeHead: { name: string } }>;
};

type StructureItemDraft = { feeHeadId: string; amount: string };

type SiblingDue = {
  studentId: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
  totalFee: number;
  paid: number;
  remaining: number;
};

function familyLabel(f: Family) {
  const parents = [f.fatherName, f.motherName].filter(Boolean).join(" / ");
  if (parents && f.primaryPhone) return `${parents} · ${f.primaryPhone}`;
  return parents || f.primaryPhone || "Family";
}

export function FeesClient(props: {
  heads: Head[];
  fees: Fee[];
  payments: Payment[];
  families: Family[];
  students: Student[];
  sessions: Session[];
  currentSessionId: string | null;
  classes: ClassRow[];
  structures: Structure[];
}) {
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"payments" | "records" | "setup">("payments");
  const [showDefaultersOnly, setShowDefaultersOnly] = useState(false);
  const [headName, setHeadName] = useState("");
  const [structureForm, setStructureForm] = useState({
    name: "",
    sessionId: props.currentSessionId ?? props.sessions[0]?.id ?? "",
    classId: props.classes[0]?.id ?? "",
  });
  const [structureItems, setStructureItems] = useState<StructureItemDraft[]>([
    { feeHeadId: props.heads[0]?.id ?? "", amount: "" },
  ]);
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({
    familyId: props.families[0]?.id ?? "",
    amount: "",
    method: "UPI",
    referenceNo: "",
    notes: "",
  });
  const [siblingDues, setSiblingDues] = useState<SiblingDue[]>([]);
  const [allocs, setAllocs] = useState<Array<{ studentId: string; amount: string }>>([]);
  const [receipt, setReceipt] = useState<unknown>(null);

  const structureTotal = useMemo(
    () => structureItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0),
    [structureItems],
  );

  const allocTotal = useMemo(
    () => allocs.reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
    [allocs],
  );

  // Aggregate ledgers by student for office overview
  const studentLedgers = useMemo(() => {
    const map = new Map<
      string,
      { name: string; admissionNo: string; total: number; paid: number; remaining: number }
    >();
    for (const f of props.fees) {
      const cur = map.get(f.student.id) ?? {
        name: f.student.fullName,
        admissionNo: f.student.admissionNo,
        total: 0,
        paid: 0,
        remaining: 0,
      };
      cur.total += f.amount;
      cur.paid += f.paidAmount;
      cur.remaining += f.balance;
      map.set(f.student.id, cur);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [props.fees]);

  const filteredLedgers = useMemo(() => {
    if (showDefaultersOnly) {
      return studentLedgers.filter((l) => l.remaining > 0);
    }
    return studentLedgers;
  }, [studentLedgers, showDefaultersOnly]);

  const autoAllocate = (totalAmount: number, dues: SiblingDue[]) => {
    let remaining = totalAmount;
    const nextAllocs = dues.map((d) => {
      if (remaining <= 0) {
        return { studentId: d.studentId, amount: "" };
      }
      const allocated = Math.min(d.remaining, remaining);
      remaining -= allocated;
      return { studentId: d.studentId, amount: allocated > 0 ? String(allocated) : "" };
    });
    setAllocs(nextAllocs);
  };

  const handleAmountChange = (val: string) => {
    setPayForm((f) => ({ ...f, amount: val }));
    const num = Number(val) || 0;
    autoAllocate(num, siblingDues);
  };

  useEffect(() => {
    if (!payForm.familyId) {
      setSiblingDues([]);
      setAllocs([]);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      try {
        const dues = await getFamilyFeeDuesAction(payForm.familyId);
        if (cancelled) return;
        setSiblingDues(dues);
        const currentAmount = Number(payForm.amount) || 0;
        let remaining = currentAmount;
        const initialAllocs = dues.map((d) => {
          if (remaining <= 0) {
            return { studentId: d.studentId, amount: "" };
          }
          const allocated = Math.min(d.remaining, remaining);
          remaining -= allocated;
          return { studentId: d.studentId, amount: allocated > 0 ? String(allocated) : "" };
        });
        setAllocs(initialAllocs);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load sibling dues");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [payForm.familyId]);

  function run(fn: () => Promise<unknown>, ok: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function loadStructureForEdit(st: Structure) {
    setEditingStructureId(st.id);
    setStructureForm({
      name: st.name ?? "",
      sessionId: st.sessionId,
      classId: st.classId,
    });
    setStructureItems(
      st.items.map((i) => ({ feeHeadId: i.feeHeadId, amount: String(i.amount) })),
    );
  }

  function resetStructureForm() {
    setEditingStructureId(null);
    setStructureForm({
      name: "",
      sessionId: props.currentSessionId ?? props.sessions[0]?.id ?? "",
      classId: props.classes[0]?.id ?? "",
    });
    setStructureItems([{ feeHeadId: props.heads[0]?.id ?? "", amount: "" }]);
  }

  const canSaveStructure = Boolean(
    structureForm.sessionId &&
    structureForm.classId &&
    structureItems.length > 0 &&
    structureItems.every((i) => i.feeHeadId && Number(i.amount) > 0),
  );

  const canRecordPayment = Boolean(
    payForm.familyId &&
    Number(payForm.amount) > 0 &&
    allocs.some((a) => Number(a.amount) > 0) &&
    Math.abs(allocTotal - Number(payForm.amount)) < 0.01,
  );

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="no-print flex border-b border-stone-200">
        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={cn(
            "px-4 py-2 text-sm font-semibold border-b-2 transition-colors",
            activeTab === "payments"
              ? "border-primary text-primary"
              : "border-transparent text-stone-500 hover:text-stone-800"
          )}
        >
          Collect Payments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("records")}
          className={cn(
            "px-4 py-2 text-sm font-semibold border-b-2 transition-colors",
            activeTab === "records"
              ? "border-primary text-primary"
              : "border-transparent text-stone-500 hover:text-stone-800"
          )}
        >
          Fee Book & Ledgers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("setup")}
          className={cn(
            "px-4 py-2 text-sm font-semibold border-b-2 transition-colors",
            activeTab === "setup"
              ? "border-primary text-primary"
              : "border-transparent text-stone-500 hover:text-stone-800"
          )}
        >
          Setup Fees
        </button>
      </div>

      {activeTab === "setup" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Fee heads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Named charge types used in class fee structures (e.g. Tuition, Transport).
              </p>
              <Input
                value={headName}
                onChange={(e) => setHeadName(e.target.value)}
                placeholder="Admission Fee"
              />
              <Button
                disabled={pending || !headName.trim()}
                onClick={() =>
                  run(async () => {
                    await createFeeHeadAction({
                      name: headName.trim(),
                      frequency: "ANNUAL",
                      isActive: true,
                    });
                    setHeadName("");
                  }, "Fee head created")
                }
              >
                Add fee head
              </Button>
              <div className="max-h-48 space-y-1 overflow-auto text-sm">
                {props.heads.length === 0 ? (
                  <p className="text-muted-foreground">
                    Add heads first: Admission Fee, Tuition Fee, Computer Fee, etc.
                  </p>
                ) : (
                  props.heads.map((h) => (
                    <div key={h.id} className="rounded border px-2 py-1">
                      {h.name}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {editingStructureId ? "Update fee structure" : "Fee structure"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                One active fee structure per class per academic session. Students inherit it
                automatically on admission — no manual assignment.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Academic session</Label>
                  <Select
                    value={structureForm.sessionId}
                    disabled={!!editingStructureId}
                    onChange={(e) =>
                      setStructureForm((f) => ({ ...f, sessionId: e.target.value }))
                    }
                  >
                    <option value="" disabled>
                      Select session
                    </option>
                    {props.sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select
                    value={structureForm.classId}
                    disabled={!!editingStructureId}
                    onChange={(e) =>
                      setStructureForm((f) => ({ ...f, classId: e.target.value }))
                    }
                  >
                    <option value="" disabled>
                      Select class
                    </option>
                    {props.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Name (optional)</Label>
                  <Input
                    value={structureForm.name}
                    onChange={(e) =>
                      setStructureForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Class I Annual"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Fee line items</Label>
                {structureItems.map((item, idx) => (
                  <div key={idx} className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
                    <Select
                      value={item.feeHeadId}
                      onChange={(e) =>
                        setStructureItems((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, feeHeadId: e.target.value } : r,
                          ),
                        )
                      }
                    >
                      <option value="" disabled>
                        Fee head
                      </option>
                      {props.heads.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={item.amount}
                      onChange={(e) =>
                        setStructureItems((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, amount: e.target.value } : r,
                          ),
                        )
                      }
                      placeholder="Amount"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={structureItems.length <= 1}
                      onClick={() =>
                        setStructureItems((rows) => rows.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={props.heads.length === 0}
                    onClick={() =>
                      setStructureItems((rows) => [
                        ...rows,
                        { feeHeadId: props.heads[0]?.id ?? "", amount: "" },
                      ])
                    }
                  >
                    Add line
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Total annual fee: {formatCurrency(structureTotal)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={pending || !canSaveStructure}
                  onClick={() => {
                    const activeItems = structureItems.map((i) => ({
                      feeHeadId: i.feeHeadId,
                      amount: Number(i.amount),
                    }));
                    if (editingStructureId) {
                      run(async () => {
                        await updateFeeStructureAction({
                          id: editingStructureId,
                          name: (structureForm.name ?? "").trim() || undefined,
                          items: activeItems,
                        });
                        resetStructureForm();
                      }, "Fee structure updated");
                    } else {
                      run(async () => {
                        await createFeeStructureAction({
                          sessionId: structureForm.sessionId,
                          classId: structureForm.classId,
                          name: (structureForm.name ?? "").trim() || undefined,
                          items: activeItems,
                        });
                        resetStructureForm();
                      }, "Fee structure created");
                    }
                  }}
                >
                  {editingStructureId ? "Save structure" : "Create structure"}
                </Button>
                {editingStructureId ? (
                  <Button type="button" variant="outline" onClick={resetStructureForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Active fee structures</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[400px] overflow-auto">
              <div className="space-y-3">
                {props.structures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No structures created yet.</p>
                ) : (
                  props.structures.map((st) => (
                    <div
                      key={st.id}
                      className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold">
                          {st.class.name} · {st.name}
                        </p>
                        <p className="text-xs text-muted-foreground">Session {st.session.name}</p>
                        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          {st.items.map((item, idx) => (
                            <li key={idx}>
                              {item.feeHead.name}: {formatCurrency(item.amount)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold">
                          Total {formatCurrency(st.totalAnnualFee)}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => loadStructureForEdit(st)}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "payments" && (
        <Card>
          <CardHeader>
            <CardTitle>Record family payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Record the parent&apos;s payment. The system will automatically allocate the amount among siblings.
            </p>
            {props.families.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No families yet. Admit a student first.
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2 lg:col-span-2">
                <Label>Family</Label>
                <Select
                  value={payForm.familyId}
                  disabled={props.families.length === 0}
                  onChange={(e) =>
                    setPayForm((f) => ({ ...f, familyId: e.target.value }))
                  }
                >
                  <option value="" disabled>
                    Select family
                  </option>
                  {props.families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {familyLabel(f)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Payment received</Label>
                <Input
                  value={payForm.amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="5000"
                />
              </div>
              <div className="space-y-2">
                <Label>Payment mode</Label>
                <Select
                  value={payForm.method}
                  onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reference number</Label>
                <Input
                  value={payForm.referenceNo}
                  onChange={(e) =>
                    setPayForm((f) => ({ ...f, referenceNo: e.target.value }))
                  }
                  placeholder="123456"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Input
                value={payForm.notes}
                onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="July Fees"
              />
            </div>

            <div className="space-y-3">
              <Label>Allocate among siblings</Label>
              {siblingDues.length === 0 && payForm.familyId ? (
                <p className="text-sm text-muted-foreground">
                  No active students with fee dues in this family.
                </p>
              ) : null}
              {siblingDues.map((due) => {
                const alloc = allocs.find((a) => a.studentId === due.studentId);
                return (
                  <div
                    key={due.studentId}
                    className="grid gap-2 rounded border p-3 md:grid-cols-[1fr_140px]"
                  >
                    <div className="text-sm">
                      <p className="font-medium">{due.fullName}</p>
                      <p className="text-muted-foreground">
                        {due.classLabel} · Total due {formatCurrency(due.remaining)}
                        <span className="mx-1">·</span>
                        Paid {formatCurrency(due.paid)} / {formatCurrency(due.totalFee)}
                      </p>
                    </div>
                    <Input
                      value={alloc?.amount ?? ""}
                      onChange={(e) =>
                        setAllocs((rows) =>
                          rows.map((r) =>
                            r.studentId === due.studentId
                              ? { ...r, amount: e.target.value }
                              : r,
                          ),
                        )
                      }
                      placeholder="Allocate ₹"
                    />
                  </div>
                );
              })}
              {siblingDues.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Allocated {formatCurrency(allocTotal)} of{" "}
                  {formatCurrency(Number(payForm.amount) || 0)}
                </p>
              ) : null}
            </div>

            <Button
              disabled={pending || !canRecordPayment}
              onClick={() => {
                if (!canRecordPayment) {
                  toast.error(
                    "Enter payment amount and allocate the full amount among siblings",
                  );
                  return;
                }
                const activeAllocs = allocs.filter((a) => Number(a.amount) > 0);
                run(async () => {
                  await recordPaymentAction({
                    familyId: payForm.familyId,
                    amount: Number(payForm.amount),
                    method: payForm.method as "CASH" | "UPI" | "CHEQUE" | "BANK_TRANSFER",
                    referenceNo: payForm.referenceNo || null,
                    notes: payForm.notes || null,
                    allocations: activeAllocs.map((a) => ({
                      studentId: a.studentId,
                      studentFeeId: null,
                      amount: Number(a.amount),
                    })),
                  });
                  setPayForm((f) => ({ ...f, amount: "", referenceNo: "", notes: "" }));
                }, "Payment recorded — ledgers updated");
              }}
            >
              Save payment & update ledgers
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === "records" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle>Student fee records</CardTitle>
              <label className="flex items-center space-x-2 text-xs text-stone-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showDefaultersOnly}
                  onChange={(e) => setShowDefaultersOnly(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span>Dues Only</span>
              </label>
            </CardHeader>
            <CardContent className="max-h-80 space-y-2 overflow-auto text-sm">
              {filteredLedgers.length === 0 ? (
                <p className="text-muted-foreground font-medium">
                  No fee records found.
                </p>
              ) : (
                filteredLedgers.map((l) => (
                  <div
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
                  >
                    <div>
                      <p className="font-medium">{l.name}</p>
                      <p className="text-muted-foreground">{l.admissionNo}</p>
                    </div>
                    <div className="text-right">
                      <p>Total {formatCurrency(l.total)}</p>
                      <p className="text-muted-foreground">
                        Paid {formatCurrency(l.paid)} · Remaining{" "}
                        {formatCurrency(l.remaining)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 space-y-2 overflow-auto text-sm">
              {props.payments.length === 0 ? (
                <p className="text-muted-foreground">No payments recorded yet.</p>
              ) : (
                props.payments.map((p) => (
                  <div key={p.id} className="rounded border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {formatCurrency(p.amount)} · {p.method}
                        </p>
                        <p className="text-muted-foreground">
                          {formatDate(p.paidAt)}
                          {p.referenceNo ? ` · Ref ${p.referenceNo}` : ""}
                          {p.notes ? ` · ${p.notes}` : ""}
                        </p>
                        <p className="text-muted-foreground">
                          Allocated:{" "}
                          {p.allocations
                            .map((a) => `${a.student.fullName} ${formatCurrency(a.amount)}`)
                            .join(", ") || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{p.receiptNo}</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                const r = await getReceiptAction(p.id);
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
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {receipt ? (
        <div className="print-only mx-auto my-4 max-w-xl border border-stone-300 bg-white p-8 text-black shadow-sm font-sans rounded-md">
          {/* Header */}
          <div className="border-b border-stone-200 pb-4 mb-4 text-center">
            {(receipt as any).branding?.logoDocumentId && (
              <img
                src={`/api/documents/${(receipt as any).branding.logoDocumentId}`}
                className="mx-auto h-16 w-auto object-contain mb-3"
                alt="School Logo"
              />
            )}
            <h1 className="text-xl font-bold tracking-wide uppercase text-stone-800">
              {(receipt as any).branding?.schoolName || "Vidhyanjali Public School"}
            </h1>
            {((receipt as any).branding?.address) && (
              <p className="text-xs text-stone-500">{(receipt as any).branding.address}</p>
            )}
            {((receipt as any).branding?.phone || (receipt as any).branding?.email) && (
              <p className="text-[10px] text-stone-400 mt-0.5">
                {[
                  (receipt as any).branding.phone ? `Ph: ${(receipt as any).branding.phone}` : "",
                  (receipt as any).branding.email ? `Email: ${(receipt as any).branding.email}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <div className="mt-3 inline-block rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold tracking-wider uppercase text-stone-600">
              Fee Payment Receipt
            </div>
          </div>

          {/* Details Row */}
          <div className="grid grid-cols-2 gap-4 text-xs mb-6">
            <div className="space-y-1">
              <p><span className="text-stone-500 font-medium">Receipt No:</span> <span className="font-mono font-semibold">{(receipt as any).receiptNo}</span></p>
              <p><span className="text-stone-500 font-medium">Date & Time:</span> {formatDate((receipt as any).paidAt)}</p>
              <p><span className="text-stone-500 font-medium">Mode:</span> <span className="font-semibold">{(receipt as any).method}</span></p>
              {((receipt as any).referenceNo) && (
                <p><span className="text-stone-500 font-medium">Ref/Cheque No:</span> <span className="font-mono">{(receipt as any).referenceNo}</span></p>
              )}
            </div>
            <div className="text-right space-y-1">
              <p className="font-semibold text-stone-700">Received From (Parent):</p>
              <p className="font-medium text-stone-900">
                {[(receipt as any).family?.fatherName, (receipt as any).family?.motherName]
                  .filter(Boolean)
                  .join(" & ") || "Parent/Guardian"}
              </p>
              {((receipt as any).family?.primaryPhone) && (
                <p className="text-stone-500">Mob: {(receipt as any).family.primaryPhone}</p>
              )}
            </div>
          </div>

          {/* Allocations Table */}
          <table className="w-full text-xs border-collapse mb-6">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left">
                <th className="py-2 px-3 font-semibold text-stone-600">Student Name (Admn No)</th>
                <th className="py-2 px-3 font-semibold text-stone-600">Fee Head</th>
                <th className="py-2 px-3 font-semibold text-stone-600 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {((receipt as any).allocations || []).map((alloc: any, idx: number) => (
                <tr key={idx} className="border-b border-stone-100">
                  <td className="py-2 px-3 font-medium text-stone-800">
                    {alloc.studentName} <span className="text-[10px] text-stone-400 font-mono">({alloc.admissionNo})</span>
                  </td>
                  <td className="py-2 px-3 text-stone-600">{alloc.feeHead}</td>
                  <td className="py-2 px-3 text-right font-mono text-stone-900">{formatCurrency(alloc.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t border-stone-200 pt-4 flex flex-col items-end gap-1.5">
            <div className="flex justify-between w-64 text-xs">
              <span className="text-stone-500">Subtotal:</span>
              <span className="font-mono text-stone-700">{formatCurrency((receipt as any).amount)}</span>
            </div>
            <div className="flex justify-between w-64 text-sm font-bold border-t pt-2 mt-1">
              <span>Total Received:</span>
              <span className="font-mono text-stone-900">{(receipt as any).amountFormatted}</span>
            </div>
          </div>

          {/* Signatures */}
          <div className="mt-12 grid grid-cols-2 gap-4 text-center text-[10px] text-stone-400">
            <div className="pt-8 border-t border-dashed border-stone-200">
              <p className="font-medium text-stone-600">{(receipt as any).recordedBy || "Cashier"}</p>
              <p>Issued By</p>
            </div>
            <div className="pt-8 border-t border-dashed border-stone-200">
              <p className="h-4"></p>
              <p>Authorized Signatory</p>
            </div>
          </div>

          {/* Footer */}
          {((receipt as any).branding?.receiptFooter) && (
            <div className="text-center mt-8 pt-4 border-t border-stone-100 text-[10px] text-stone-400">
              <p>{(receipt as any).branding.receiptFooter}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

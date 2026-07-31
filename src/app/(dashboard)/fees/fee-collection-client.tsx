"use client";

import { useState, useTransition, useMemo, Fragment } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  recordPaymentAction,
  getReceiptAction,
} from "@/server/actions/fee.actions";
import { createFeeDiscountAction, revokeFeeDiscountAction } from "@/server/actions/discount.actions";
import { waiveStudentFineAction } from "@/server/actions/fine.actions";
import {
  recordWalletTransactionAction,
  refundFamilyAdvanceAction,
  reconcileFamilyAdvanceAction,
} from "@/server/actions/wallet.actions";
import { getStudentFinancialProfileAction } from "@/server/actions/financial-profile.actions";
import {
  Search,
  CreditCard,
  Percent,
  ShieldAlert,
  Wallet,
  Printer,
  X,
  ChevronRight,
  ChevronDown,
  User,
  AlertCircle,
  Users,
  CheckCircle2,
  Calendar,
  History,
  FileText,
  Trash2,
  PenLine,
} from "lucide-react";

type StudentItem = {
  id: string;
  fullName: string;
  admissionNo: string;
  familyId: string;
  fatherName?: string | null;
  classLabel?: string | null;
  primaryPhone?: string | null;
};

type Session = { id: string; name: string };

export function FeeCollectionClient({
  students,
  sessions,
  currentSessionId,
}: {
  students: StudentItem[];
  sessions: Session[];
  currentSessionId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [studentSearch, setStudentSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [profile, setProfile] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Selected payment months & accordion toggles
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  // Payment Allocation Parameters
  const [allocationMode, setAllocationMode] = useState<"FIFO" | "MANUAL">("FIFO");
  const [manualMonthAmounts, setManualMonthAmounts] = useState<Record<string, string>>({});
  const [useWalletApplied, setUseWalletApplied] = useState(false);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showFineModal, setShowFineModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [receiptSnapshot, setReceiptSnapshot] = useState<any | null>(null);

  const [payForm, setPayForm] = useState({ amount: "", method: "CASH", referenceNo: "", notes: "" });
  const [discountForm, setDiscountForm] = useState({ feeHeadId: "", category: "CUSTOM", discountType: "FIXED_AMOUNT", value: "", reason: "", scope: "RECURRING" as "RECURRING" | "ONE_TIME" });
  const [fineForm, setFineForm] = useState({ fineId: "", waiveAmount: "", fullWaiver: true, reason: "" });
  const [walletForm, setWalletForm] = useState({ actionType: "CREDIT", amount: "", reason: "" });
  const [selectedFineForWaiver, setSelectedFineForWaiver] = useState<any | null>(null);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return [];
    return students.filter(s =>
      `${s.fullName} ${s.admissionNo} ${s.fatherName ?? ""} ${s.classLabel ?? ""} ${s.primaryPhone ?? ""}`.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [studentSearch, students]);

  function loadProfile(id: string) {
    setProfileLoading(true);
    setSelectedMonths([]);
    setExpandedMonths({});
    setUseWalletApplied(false);
    setAllocationMode("FIFO");
    setManualMonthAmounts({});
    startTransition(async () => {
      try {
        const data = await getStudentFinancialProfileAction(id);
        setProfile(data);
        setExpandedMonths({});
      } catch (e) {
        toast.error("Failed to load student profile");
      } finally {
        setProfileLoading(false);
      }
    });
  }

  function selectStudent(s: StudentItem) {
    setSelectedStudentId(s.id);
    setStudentSearch(s.fullName);
    setShowDropdown(false);
    loadProfile(s.id);
  }

  function runAction(fn: () => Promise<unknown>, msg: string, cb?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(msg);
        if (selectedStudentId) loadProfile(selectedStudentId);
        cb?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  // Selected Months Breakdown
  const selectedMonthsSummary = useMemo(() => {
    if (!profile?.monthlyMatrix || selectedMonths.length === 0) {
      return { subtotal: 0, discount: 0, fine: 0, remaining: 0 };
    }
    let subtotal = 0;
    let discount = 0;
    let fine = 0;
    let remaining = 0;

    profile.monthlyMatrix.forEach((m: any) => {
      if (selectedMonths.includes(m.month)) {
        subtotal += m.originalAmount || 0;
        discount += m.discountAmount || 0;
        fine += m.finalFine || 0;
        remaining += m.remaining || 0;
      }
    });

    return { subtotal, discount, fine, remaining };
  }, [profile, selectedMonths]);

  const totalOutstanding = profile?.summary?.totalRemaining ?? 0;
  const totalPaid = profile?.summary?.totalPaid ?? 0;
  const walletBalance = profile?.summary?.walletBalance ?? 0;

  // Sync manual amounts as selected months are toggled
  const currentDueAmount = selectedMonths.length > 0 ? selectedMonthsSummary.remaining : totalOutstanding;

  // Final Net payable inside collection form after wallet logic
  const netDueAfterWallet = useMemo(() => {
    const rawDue = allocationMode === "MANUAL"
      ? Object.values(manualMonthAmounts).reduce((acc, curr) => acc + (Number(curr) || 0), 0)
      : currentDueAmount;
    
    if (!useWalletApplied) return rawDue;
    return Math.max(0, rawDue - walletBalance);
  }, [currentDueAmount, useWalletApplied, walletBalance, allocationMode, manualMonthAmounts]);

  function openPaymentModal() {
    // Pre-initialize manual month amounts if manual mode selected
    const initialManual: Record<string, string> = {};
    if (selectedMonths.length > 0) {
      selectedMonths.forEach(m => {
        const matrixMonth = profile?.monthlyMatrix?.find((x: any) => x.month === m);
        initialManual[m] = String(matrixMonth?.remaining || 0);
      });
    } else {
      profile?.monthlyMatrix?.forEach((m: any) => {
        if (m.remaining > 0) {
          initialManual[m.month] = String(m.remaining);
        }
      });
    }
    setManualMonthAmounts(initialManual);

    setPayForm({
      amount: String(netDueAfterWallet),
      method: "CASH",
      referenceNo: "",
      notes: selectedMonths.length > 0 ? `Fees for ${selectedMonths.join(", ")}` : "Fee Payment",
    });
    setShowPaymentModal(true);
  }

  // Auto-allocate sum when manual inputs are changed
  function handleManualAmountChange(month: string, val: string) {
    const nextManual = { ...manualMonthAmounts, [month]: val };
    setManualMonthAmounts(nextManual);
    const totalManual = Object.values(nextManual).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
    const finalAmount = useWalletApplied ? Math.max(0, totalManual - walletBalance) : totalManual;
    setPayForm(f => ({ ...f, amount: String(finalAmount) }));
  }

  function handlePayment() {
    if (!profile) return;
    const amt = Number(payForm.amount) || 0;

    // Handle Wallet Settlement without Cash
    if (amt === 0 && useWalletApplied) {
      runAction(async () => {
        await reconcileFamilyAdvanceAction(profile.student.family.id);
        setShowPaymentModal(false);
      }, "Wallet reconciliation settled dues successfully");
      return;
    }

    if (amt <= 0) { toast.error("Payment amount must be greater than zero"); return; }

    // Map allocations based on mode
    let payloadAllocations: Array<{ studentId: string; studentFeeId: string | null; amount: number }> = [];

    if (allocationMode === "MANUAL") {
      // Loop over the manual month amounts entered by the user
      Object.entries(manualMonthAmounts).forEach(([mName, val]) => {
        const monthAmt = Number(val) || 0;
        if (monthAmt <= 0) return;

        const matrixMonth = profile.monthlyMatrix?.find((x: any) => x.month === mName);
        if (!matrixMonth) return;

        // Distribute the monthly amount across the individual head items of that month (client-side FIFO)
        let remainingAllocation = monthAmt;
        matrixMonth.items.forEach((item: any) => {
          if (remainingAllocation <= 0) return;
          const unpaidItemBalance = item.remaining;
          if (unpaidItemBalance <= 0) return;

          const allocToThisItem = Math.min(remainingAllocation, unpaidItemBalance);
          payloadAllocations.push({
            studentId: profile.student.id,
            studentFeeId: item.studentFeeId,
            amount: allocToThisItem,
          });
          remainingAllocation -= allocToThisItem;
        });

        // If there's leftover for the month (e.g. overpayment), add it as a general allocation to the first fee item
        if (remainingAllocation > 0 && matrixMonth.items[0]) {
          payloadAllocations.push({
            studentId: profile.student.id,
            studentFeeId: matrixMonth.items[0].studentFeeId,
            amount: remainingAllocation,
          });
        }
      });
    } else {
      // FIFO mode auto-allocation
      payloadAllocations = [{ studentId: profile.student.id, studentFeeId: null, amount: amt }];
    }

    if (payloadAllocations.length === 0) {
      toast.error("Please enter a payment amount for at least one month.");
      return;
    }

    runAction(async () => {
      const result = await recordPaymentAction({
        familyId: profile.student.family.id,
        amount: amt,
        method: payForm.method as any,
        referenceNo: payForm.referenceNo || null,
        notes: payForm.notes || null,
        allocations: payloadAllocations,
      });
      setShowPaymentModal(false);
      if (result?.paymentId) {
        const r = await getReceiptAction(result.paymentId);
        setReceiptSnapshot(r.snapshot);
      }
    }, "Payment collected and allocated successfully");
  }

  function handleDiscount() {
    if (!profile) return;
    const val = Number(discountForm.value) || 0;
    if (val <= 0 || !discountForm.reason.trim()) { toast.error("Enter value and reason"); return; }

    // For ONE_TIME scope, find the next unpaid month
    let targetMonth: string | undefined;
    if (discountForm.scope === "ONE_TIME") {
      const unpaidMonth = profile.monthlyMatrix?.find((m: any) => m.remaining > 0);
      if (!unpaidMonth) { toast.error("No unpaid month found for one-time concession"); return; }
      targetMonth = unpaidMonth.month;
    }

    runAction(async () => {
      await createFeeDiscountAction({
        studentId: profile.student.id,
        sessionId: currentSessionId ?? sessions[0]?.id ?? "",
        feeHeadId: discountForm.feeHeadId || undefined,
        month: targetMonth as any,
        discountType: discountForm.discountType as any,
        value: val,
        category: discountForm.category as any,
        reason: discountForm.reason.trim(),
      });
      setShowDiscountModal(false);
      setDiscountForm({ feeHeadId: "", category: "CUSTOM", discountType: "FIXED_AMOUNT", value: "", reason: "", scope: "RECURRING" });
    }, discountForm.scope === "ONE_TIME"
      ? `One-time concession of ${formatCurrency(val)} applied to ${targetMonth}`
      : "Concession applied successfully");
  }

  function handleWaiveFine() {
    if (!fineForm.fineId || !fineForm.reason.trim()) { toast.error("Select fine and enter reason"); return; }
    runAction(async () => {
      await waiveStudentFineAction({
        studentFeeFineId: fineForm.fineId,
        waiveAmount: fineForm.fullWaiver ? undefined : Number(fineForm.waiveAmount) || undefined,
        fullWaiver: fineForm.fullWaiver,
        reason: fineForm.reason.trim(),
      });
      setShowFineModal(false);
      setSelectedFineForWaiver(null);
    }, "Late fee waived");
  }

  function handleRevokeDiscount(discountId: string) {
    if (!confirm("Are you sure you want to revoke this concession? This will recalculate the student's fee amounts.")) return;
    runAction(async () => {
      await revokeFeeDiscountAction({ discountId, reason: "Revoked by accountant" });
    }, "Concession revoked successfully");
  }

  function handleWallet() {
    if (!profile) return;
    const amt = Number(walletForm.amount) || 0;
    if (amt <= 0 || !walletForm.reason.trim()) { toast.error("Enter amount and reason"); return; }
    runAction(async () => {
      if (walletForm.actionType === "CREDIT") {
        await recordWalletTransactionAction({ familyId: profile.student.family.id, type: "CREDIT_NOTE_ADJUSTMENT" as any, amount: amt, reason: walletForm.reason });
      } else {
        await refundFamilyAdvanceAction({ familyId: profile.student.family.id, amount: amt, reason: walletForm.reason });
      }
      setShowWalletModal(false);
      setWalletForm({ actionType: "CREDIT", amount: "", reason: "" });
    }, "Wallet transaction successful");
  }

  const toggleMonth = (m: string) => setExpandedMonths(prev => ({ ...prev, [m]: !prev[m] }));
  const toggleMonthSelect = (m: string) => setSelectedMonths(prev =>
    prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
  );

  return (
    <div className="max-w-[1550px] mx-auto bg-stone-50 rounded-2xl border border-stone-200 shadow-md overflow-hidden grid grid-cols-[420px_1fr] h-[calc(100vh-170px)] text-sm">
      
      {/* LEFT COLUMN: STUDENT DETAIL & PAYMENT ACTION DRAWER */}
      <div className="bg-white border-r border-stone-200 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-stone-200 bg-white z-20">
          <Label className="text-xs font-bold text-stone-500 uppercase tracking-widest block mb-2">Student Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              value={studentSearch}
              onChange={e => { setStudentSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search student, parent, phone..."
              className="pl-9 h-10 text-sm border-stone-355 rounded-lg"
            />
            {showDropdown && filteredStudents.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-stone-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
                {filteredStudents.map(s => (
                  <button key={s.id} type="button" onMouseDown={() => selectStudent(s)}
                    className="w-full text-left px-4 py-3 hover:bg-stone-50 border-b border-stone-105 last:border-0 flex justify-between items-center transition-colors">
                    <div>
                      <p className="font-extrabold text-stone-900 text-sm">{s.fullName}</p>
                      <p className="text-xs text-stone-505 mt-0.5">Adm: {s.admissionNo} · Class: {s.classLabel}</p>
                      {s.fatherName && (
                        <p className="text-xs text-indigo-700 font-semibold mt-1">Parent: {s.fatherName} {s.primaryPhone ? `(${s.primaryPhone})` : ""}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>


        {profile ? (
          <div className="flex-1 flex flex-col justify-between">
            <div className="p-5 space-y-4">              <div className="flex gap-3.5 items-center bg-stone-50/50 p-4 rounded-xl border border-stone-200">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold text-sm shrink-0 select-none">
                  {profile.student.fullName
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-extrabold text-stone-950 text-sm truncate">{profile.student.fullName}</h4>
                  <p className="text-xs text-stone-500 mt-1">Admission No: {profile.student.admissionNo}</p>
                  <p className="text-xs text-stone-500">Class: {profile.student.currentEnrollment?.label || "Unassigned"}</p>
                  <p className="text-xs text-indigo-700 font-semibold mt-1.5">Parent: {profile.student.family?.fatherName} ({profile.student.family?.primaryPhone})</p>
                </div>
              </div>

              {/* BALANCE CARDS + CONCESSION & FINE DETAILS */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">Ledger Balance Overview</span>
                
                <div className="border border-rose-200 rounded-xl p-3 bg-rose-50/40 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-rose-800">Dues to Collect (Outstanding)</p>
                    <p className="text-[10px] text-stone-505">Net unpaid fee charges & late fines</p>
                  </div>
                  <p className="text-lg font-black font-mono text-rose-700">{formatCurrency(totalOutstanding)}</p>
                </div>

                <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50/20 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-emerald-800">What is Paid (Collected)</p>
                    <p className="text-[10px] text-stone-505">Payments settled in this session</p>
                  </div>
                  <p className="text-lg font-black font-mono text-emerald-700">{formatCurrency(totalPaid)}</p>
                </div>

                {/* CONCESSION DETAILS CARD */}
                <div className="border border-teal-200 rounded-xl p-3 bg-teal-50/30 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-teal-800">Total Concessions</p>
                      <p className="text-[10px] text-stone-505">{profile.discounts?.filter((d: any) => d.status === "ACTIVE").length || 0} active concession(s)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black font-mono text-teal-700">{formatCurrency(profile.summary?.totalDiscounts ?? 0)}</p>
                      <button onClick={() => setShowDiscountModal(true)} className="p-1 rounded-md hover:bg-teal-100 transition-colors" title="Add Concession">
                        <PenLine className="w-3.5 h-3.5 text-teal-600" />
                      </button>
                    </div>
                  </div>
                  {profile.discounts?.filter((d: any) => d.status === "ACTIVE").length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-teal-200/60">
                      {profile.discounts.filter((d: any) => d.status === "ACTIVE").map((d: any) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 bg-white/70 rounded-lg px-2.5 py-1.5 border border-teal-100">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-stone-800 truncate">
                              {d.category.replace(/_/g, " ")} — {d.feeHeadName}
                              {d.month && <span className="text-stone-400 font-normal"> ({d.month})</span>}
                            </p>
                            <p className="text-[10px] text-stone-500 truncate">
                              {d.discountType === "PERCENTAGE" ? `${d.value}%` : formatCurrency(d.value)} · {d.reason}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRevokeDiscount(d.id)}
                            className="p-1 rounded-md hover:bg-rose-100 transition-colors shrink-0"
                            title="Revoke Concession"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* LATE FINE DETAILS CARD */}
                <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/30 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-amber-800">Late Fines</p>
                      <p className="text-[10px] text-stone-505">
                        Calculated: {formatCurrency(profile.summary?.totalCalculatedFine ?? 0)}
                        {(profile.summary?.totalWaivedFine ?? 0) > 0 && <span className="text-teal-600 font-semibold"> · Waived: {formatCurrency(profile.summary.totalWaivedFine)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black font-mono text-amber-700">{formatCurrency(profile.summary?.totalFinalFine ?? 0)}</p>
                      <button
                        onClick={() => setShowFineModal(true)}
                        disabled={!profile?.fines?.some((f: any) => f.status === "ACTIVE" && f.finalAmount > 0)}
                        className="p-1 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Waive Fine"
                      >
                        <PenLine className="w-3.5 h-3.5 text-amber-600" />
                      </button>
                    </div>
                  </div>
                  {profile.fines?.filter((f: any) => f.finalAmount > 0).length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-amber-200/60">
                      {profile.fines.filter((f: any) => f.finalAmount > 0).map((f: any) => (
                        <div key={f.id} className="flex items-center justify-between gap-2 bg-white/70 rounded-lg px-2.5 py-1.5 border border-amber-100">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-stone-800 truncate">
                              {f.feeHeadName} — {f.month}
                            </p>
                            <p className="text-[10px] text-stone-500 truncate">
                              {f.ruleName} · Calc: {formatCurrency(f.calculatedAmount)}
                              {f.waivedAmount > 0 && <span className="text-teal-600"> · Waived: {formatCurrency(f.waivedAmount)}</span>}
                              {" "}· Net: <span className="font-bold text-amber-700">{formatCurrency(f.finalAmount)}</span>
                            </p>
                          </div>
                          {f.status === "ACTIVE" && f.finalAmount > 0 && (
                            <button
                              onClick={() => {
                                setSelectedFineForWaiver(f);
                                setFineForm({ fineId: f.id, waiveAmount: String(f.finalAmount), fullWaiver: true, reason: "" });
                                setShowFineModal(true);
                              }}
                              className="p-1 rounded-md hover:bg-amber-100 transition-colors shrink-0"
                              title="Waive this Fine"
                            >
                              <PenLine className="w-3.5 h-3.5 text-amber-600" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50/40 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-indigo-800">Extra Balance (Family Wallet)</p>
                    <p className="text-[10px] text-stone-550">Advance deposits available to settle dues</p>
                  </div>
                  <p className="text-lg font-black font-mono text-indigo-700">{formatCurrency(walletBalance)}</p>
                </div>
              </div>
            </div>

            {/* ACTION PANEL */}
            <div className="p-4 border-t border-stone-200 space-y-2.5 bg-white sticky bottom-0">
              <Button onClick={openPaymentModal} disabled={totalOutstanding <= 0}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm gap-2 rounded-lg shadow-sm">
                <CreditCard className="w-4 h-4" /> Collect & Allocate Payment
              </Button>
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="outline" size="sm" onClick={() => setShowDiscountModal(true)} className="text-xs h-9 font-semibold border-stone-300">
                  <Percent className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Concession
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowFineModal(true)} className="text-xs h-9 font-semibold border-stone-300"
                  disabled={!profile?.fines?.some((f: any) => f.status === "ACTIVE" && f.finalAmount > 0)}>
                  <ShieldAlert className="w-3.5 h-3.5 mr-1 text-amber-600" /> Waive Fine
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowWalletModal(true)} className="w-full h-9 text-xs font-semibold border-stone-300">
                <Wallet className="w-3.5 h-3.5 mr-1 text-indigo-655" /> Family Wallet Adjustment
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-stone-400 bg-stone-50/20">
            <Search className="w-10 h-10 text-stone-300 mb-3" />
            <p className="text-sm font-semibold">Daily Cashier Workstation</p>
            <p className="text-xs text-stone-400 mt-1 max-w-[280px]">Search student above by child's name, parent's name or mobile number</p>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: MONTH-WISE BILLING MATRIX */}
      <div className="flex flex-col overflow-hidden bg-white">
        <div className="border-b border-stone-200 px-6 py-4 bg-stone-50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-extrabold text-stone-900 text-sm">Month-wise Billing Ledger Card</h3>
            {profile && <p className="text-xs text-stone-500 mt-0.5">{profile.student.fullName} ({profile.student.admissionNo})</p>}
          </div>
          <div className="flex items-center gap-3">
            {profile && (
              <div className="flex gap-2 bg-stone-200/50 p-1 rounded-lg">
                <Button size="sm" variant="ghost" onClick={() => {
                  const nextExp: Record<string, boolean> = {};
                  profile.monthlyMatrix?.forEach((m: any) => nextExp[m.month] = true);
                  setExpandedMonths(nextExp);
                }} className="h-7 text-[10px] text-stone-600 hover:text-stone-900 font-bold px-2 rounded-md transition-all">
                  Expand All
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setExpandedMonths({})} className="h-7 text-[10px] text-stone-600 hover:text-stone-900 font-bold px-2 rounded-md transition-all">
                  Collapse All
                </Button>
              </div>
            )}
            {profile && selectedMonths.length > 0 && (
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-3.5 py-1">
                {selectedMonths.length} month(s) selected · {formatCurrency(selectedMonthsSummary.remaining)} due
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 relative">
          {profileLoading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex flex-col items-center justify-center text-stone-500 z-30 transition-all">
              <div className="w-9 h-9 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-black mt-3 text-stone-800 uppercase tracking-wider">Fetching Student Ledger...</p>
            </div>
          )}
          {!profile ? (
            <div className="h-full flex flex-col items-center justify-center text-stone-400">
              <AlertCircle className="w-12 h-12 mb-3 text-stone-200" />
              <p className="text-sm font-semibold text-stone-500 font-bold font-sans">No Student Loaded</p>
              <p className="text-xs text-stone-400 mt-1">Select a student on the left panel to load the month-wise fee matrix</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Linked siblings banner */}
              {profile.siblings && profile.siblings.length > 0 ? (
                <div className="border border-stone-200 bg-stone-50/40 rounded-xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
                    <Users className="w-4.5 h-4.5 text-indigo-650" />
                    <div>
                      <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider">Sibling Ledger Group</h4>
                      <p className="text-[10px] text-stone-500">Shared parent wallet advance balance: <span className="font-bold text-indigo-700">{formatCurrency(walletBalance)}</span></p>
                    </div>
                  </div>
                  <div className="flex overflow-x-auto gap-4 pb-2.5 w-full scrollbar-thin">
                    {profile.siblings.map((sib: any) => {
                      const initials = sib.fullName
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase();

                      return (
                        <div key={sib.id} className="bg-white border border-stone-200 rounded-xl p-4 flex gap-4 items-center hover:border-indigo-200 transition-colors shadow-2xs min-w-[310px] max-w-[340px] shrink-0">
                          {/* Sibling Avatar Indicator */}
                          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold text-sm shrink-0 select-none">
                            {initials}
                          </div>
                          
                          {/* Sibling Info */}
                          <div className="min-w-0 flex-1">
                            <p className="font-black text-stone-900 text-sm truncate">{sib.fullName}</p>
                            <p className="text-xs font-semibold text-stone-600 mt-1 truncate">Class: {sib.classLabel}</p>
                            <p className="text-xs text-stone-500 mt-0.5 truncate">Adm No: {sib.admissionNo}</p>
                            <p className="text-xs font-mono font-bold text-rose-700 mt-2">Due: {formatCurrency(sib.remaining)}</p>
                          </div>

                          {/* Quick Switch Button */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedStudentId(sib.id);
                              setStudentSearch(sib.fullName);
                              loadProfile(sib.id);
                            }}
                            className="h-9 px-3 text-xs font-extrabold text-indigo-750 hover:bg-indigo-50 border border-stone-200 rounded-lg shrink-0 transition-colors"
                          >
                            Switch
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                    <th className="py-3 px-4 w-12 text-center">Select</th>
                    <th className="py-3 px-4">Month</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Total Charged</th>
                    <th className="py-3 px-4 text-right">Paid Amount</th>
                    <th className="py-3 px-4 text-right">Late Fine</th>
                    <th className="py-3 px-4 text-right">Outstanding</th>
                    <th className="py-3 px-4 text-center">Receipts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150">
                  {profile.monthlyMatrix?.map((m: any) => {
                    const isExpanded = !!expandedMonths[m.month];
                    const isSelected = selectedMonths.includes(m.month);
                    const hasDue = m.remaining > 0;

                    // Calculate Receipt Count for this month from family payment allocations
                    const monthReceipts = profile.paymentHistory?.filter((p: any) =>
                      p.allocations?.some((a: any) => a.month === m.month)
                    ) || [];

                    return (
                      <Fragment key={m.month}>
                        {/* Month Summary Row */}
                        <tr key={m.month} className={cn("hover:bg-stone-50/50 transition-colors cursor-pointer",
                          isSelected ? "bg-indigo-50/20" : "")}>
                          
                          <td className="py-3 px-4 text-center">
                            {hasDue ? (
                              <input type="checkbox" checked={isSelected} onChange={() => toggleMonthSelect(m.month)}
                                className="rounded border-stone-350 text-indigo-650 w-4 h-4 cursor-pointer align-middle" />
                            ) : (
                              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 mx-auto align-middle" />
                            )}
                          </td>
                          
                          <td className="py-3 px-4 font-bold text-stone-900" onClick={() => toggleMonth(m.month)}>
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />}
                              <span>{m.monthName}</span>
                            </div>
                          </td>
                          
                          <td className="py-3 px-4" onClick={() => toggleMonth(m.month)}>
                            <Badge variant={m.status === "PAID" ? "success" : m.status === "OVERDUE" ? "destructive" : "outline"}
                              className="text-[9px] px-2 py-0.5 uppercase font-bold">{m.status}</Badge>
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-semibold" onClick={() => toggleMonth(m.month)}>
                            {formatCurrency(m.originalAmount)}
                          </td>

                          <td className="py-3 px-4 text-right font-mono text-emerald-700" onClick={() => toggleMonth(m.month)}>
                            {formatCurrency(m.paidAmount)}
                          </td>

                          <td className="py-3 px-4 text-right font-mono text-amber-700" onClick={() => toggleMonth(m.month)}>
                            {m.finalFine > 0 ? `+${formatCurrency(m.finalFine)}` : "—"}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold" onClick={() => toggleMonth(m.month)}>
                            <span className={hasDue ? "text-rose-700" : "text-emerald-750"}>
                              {formatCurrency(m.remaining)}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-center" onClick={() => toggleMonth(m.month)}>
                            {monthReceipts.length > 0 ? (
                              <Badge className="bg-indigo-100 hover:bg-indigo-150 text-indigo-800 text-[10px] rounded-md font-semibold border-none py-0.5 px-2">
                                {monthReceipts.length} Receipt(s)
                              </Badge>
                            ) : "—"}
                          </td>
                        </tr>

                        {/* Expand Details panel */}
                        {isExpanded && (
                          <tr key={`${m.month}-details`} className="bg-stone-50/40" onClick={(e) => e.stopPropagation()}>
                            <td colSpan={8} className="p-4 border-t border-stone-200" onClick={(e) => e.stopPropagation()}>
                              <div className="grid grid-cols-[1fr_1.2fr] gap-4" onClick={(e) => e.stopPropagation()}>
                                
                                {/* 1. Fee Head charges breakdown */}
                                <div className="border border-stone-200 rounded-xl bg-white shadow-2xs overflow-hidden flex flex-col">
                                  <div className="bg-stone-50 border-b border-stone-200 px-3.5 py-2 flex items-center justify-between shrink-0">
                                    <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                                      <FileText className="w-3.5 h-3.5 text-stone-400" /> Fee Heads & Concessions
                                    </span>
                                  </div>
                                  <div className="overflow-y-auto max-h-[240px]">
                                    <table className="w-full text-xs text-left" style={{ tableLayout: "fixed" }}>
                                      <thead>
                                        <tr className="bg-stone-50/50 text-[9px] font-bold uppercase text-stone-500 border-b">
                                          <th className="py-2 px-3 w-[40%]">Head</th>
                                          <th className="py-2 px-3 text-right w-[20%]">Charged</th>
                                          <th className="py-2 px-3 text-right text-emerald-700 w-[20%]">Concession</th>
                                          <th className="py-2 px-3 text-right w-[20%] min-w-[90px]">Balance</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-stone-100">
                                        {m.items.map((item: any, idx: number) => (
                                          <tr key={idx}>
                                            <td className="py-2 px-3 font-semibold text-stone-700 truncate">{item.feeHeadName}</td>
                                            <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{formatCurrency(item.originalAmount)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-emerald-700 whitespace-nowrap">
                                              {item.discountAmount > 0 ? `-${formatCurrency(item.discountAmount)}` : "—"}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-stone-900 whitespace-nowrap">{formatCurrency(item.remaining)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* 2. Settlement Trail (Receipts History) */}
                                <div className="border border-stone-200 rounded-xl bg-white shadow-2xs overflow-hidden flex flex-col">
                                  <div className="bg-stone-50 border-b border-stone-200 px-3.5 py-2 flex items-center justify-between shrink-0">
                                    <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                                      <History className="w-3.5 h-3.5 text-stone-400" /> Payment Settlement Trail
                                    </span>
                                  </div>
                                  <div className="overflow-y-auto max-h-[240px]">
                                    {monthReceipts.length === 0 ? (
                                      <p className="p-4 text-center text-[11px] text-stone-400">No payment settlement trail exists for this month.</p>
                                    ) : (
                                      <table className="w-full text-xs text-left" style={{ tableLayout: "fixed" }}>
                                        <thead>
                                          <tr className="bg-stone-50/50 text-[9px] font-bold uppercase text-stone-500 border-b">
                                            <th className="py-2 px-3 w-[30%]">Receipt No</th>
                                            <th className="py-2 px-3 w-[30%]">Date</th>
                                            <th className="py-2 px-3 w-[20%]">Mode</th>
                                            <th className="py-2 px-3 text-right w-[20%] min-w-[85px]">Allocated</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-stone-100">
                                          {monthReceipts.map((r: any) => {
                                            const allocForThisMonth = r.allocations
                                              ?.filter((a: any) => a.month === m.month)
                                              .reduce((s: number, a: any) => s + a.amount, 0) || 0;
                                            return (
                                              <tr key={r.id}>
                                                <td className="py-2 px-3 font-bold text-indigo-700 cursor-pointer hover:underline truncate"
                                                  onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const res = await getReceiptAction(r.id);
                                                    setReceiptSnapshot(res.snapshot);
                                                  }}>{r.receiptNo}</td>
                                                <td className="py-2 px-3 text-stone-500 truncate">{formatDate(r.paidAt)}</td>
                                                <td className="py-2 px-3"><Badge variant="outline" className="text-[9px]">{r.method}</Badge></td>
                                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">{formatCurrency(allocForThisMonth)}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </div>

                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      </div>

      {/* COLLECT PAYMENT MODAL (WITH BOTH FIFO & MANUAL ALLOCATION DRAWER) */}
      {showPaymentModal && profile && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-2.5">
              <div>
                <h3 className="font-extrabold text-stone-950 text-sm">Collect & Allocate Dues</h3>
                <p className="text-[11px] text-stone-500">{profile.student.fullName} ({profile.student.admissionNo})</p>
              </div>
              <button onClick={() => setShowPaymentModal(false)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>

            {/* Wallet Recommendation Card */}
            {walletBalance > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-indigo-900">Family Wallet Advance: {formatCurrency(walletBalance)}</span>
                  <Badge className="bg-indigo-600 text-[10px]">Settlement Choice</Badge>
                </div>
                <p className="text-[11px] text-indigo-700">Deduct payment amount from available advance wallet balance?</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { setUseWalletApplied(true); }}
                    className={cn("h-7 text-[11px] bg-indigo-600 text-white font-bold", useWalletApplied && "bg-indigo-850")}>
                    {useWalletApplied ? "Wallet Deductions Active" : "Apply Wallet"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setUseWalletApplied(false); }}
                    className="h-7 text-[11px] text-indigo-950 hover:bg-indigo-100">
                    Pay via cash/UPI
                  </Button>
                </div>
              </div>
            )}

            {/* Allocation Mode Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-lg text-xs">
              <button onClick={() => { setAllocationMode("FIFO"); setPayForm(f => ({ ...f, amount: String(useWalletApplied ? Math.max(0, currentDueAmount - walletBalance) : currentDueAmount) })); }}
                className={cn("py-1.5 text-center font-bold rounded-md transition-all",
                  allocationMode === "FIFO" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500")}>
                Oldest First (FIFO Auto)
              </button>
              <button onClick={() => setAllocationMode("MANUAL")}
                className={cn("py-1.5 text-center font-bold rounded-md transition-all",
                  allocationMode === "MANUAL" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500")}>
                Manual Month-Wise
              </button>
            </div>

            {/* Dynamic input: FIFO total vs Manual inputs list */}
            {allocationMode === "MANUAL" ? (
              <div className="space-y-2 max-h-48 overflow-y-auto border border-stone-200 rounded-xl p-3 bg-stone-50/50">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Month-wise Manual Split</span>
                
                {(selectedMonths.length > 0 ? selectedMonths : profile.monthlyMatrix?.filter((x: any) => x.remaining > 0).map((x: any) => x.month) || []).map((mName: string) => {
                  const mData = profile.monthlyMatrix?.find((x: any) => x.month === mName);
                  return (
                    <div key={mName} className="flex justify-between items-center text-xs gap-3">
                      <span className="font-bold text-stone-700">{mData?.monthName || mName} (Max: {formatCurrency(mData?.remaining || 0)})</span>
                      <div className="relative w-32 shrink-0">
                        <span className="absolute left-2.5 top-1.5 text-stone-400 text-xs">₹</span>
                        <Input
                          type="number"
                          value={manualMonthAmounts[mName] || ""}
                          onChange={e => handleManualAmountChange(mName, e.target.value)}
                          placeholder="0"
                          className="pl-6 h-8 text-xs font-bold rounded-md"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Forms parameters */}
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-stone-700">Payment Amount (₹) *</Label>
                  <Input value={payForm.amount} onChange={e => {
                    const val = e.target.value;
                    setPayForm(f => ({ ...f, amount: val }));
                    if (allocationMode === "MANUAL") {
                      // Reset manual split if user overrides in manual mode
                      setManualMonthAmounts({});
                    }
                  }} className="font-bold text-sm h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-stone-700">Payment Mode *</Label>
                  <Select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} className="h-9 mt-1">
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-stone-700">Reference / Tx #</Label>
                  <Input value={payForm.referenceNo} onChange={e => setPayForm(f => ({ ...f, referenceNo: e.target.value }))} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-stone-700">Remarks</Label>
                  <Input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} className="h-9 mt-1" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handlePayment} disabled={pending} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg">
                Confirm & Receipt
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CONCESSION MODAL */}
      {showDiscountModal && profile && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-extrabold text-stone-900 text-sm">Apply Concession</h3>
              <button onClick={() => setShowDiscountModal(false)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <Label className="text-xs font-bold text-stone-700">Apply To</Label>
                <Select value={discountForm.scope} onChange={e => setDiscountForm(f => ({ ...f, scope: e.target.value as "RECURRING" | "ONE_TIME" }))} className="h-9 mt-1">
                  <option value="RECURRING">Every Month (Recurring)</option>
                  <option value="ONE_TIME">One-time (Next Unpaid Month)</option>
                </Select>
                {discountForm.scope === "ONE_TIME" && (() => {
                  const nextUnpaid = profile.monthlyMatrix?.find((m: any) => m.remaining > 0);
                  return nextUnpaid ? (
                    <p className="text-[10px] text-indigo-600 font-semibold mt-1">Will apply to: {nextUnpaid.month}</p>
                  ) : (
                    <p className="text-[10px] text-rose-600 font-semibold mt-1">No unpaid months found</p>
                  );
                })()}
              </div>
              <div>
                <Label className="text-xs font-bold text-stone-700">Category</Label>
                <Select value={discountForm.category} onChange={e => setDiscountForm(f => ({ ...f, category: e.target.value }))} className="h-9 mt-1">
                  <option value="SIBLING">Sibling Concession</option>
                  <option value="MERIT">Academic Merit</option>
                  <option value="STAFF_CHILD">Staff Child Waiver</option>
                  <option value="SCHOLARSHIP">Scholarship</option>
                  <option value="EWS">EWS</option>
                  <option value="SPORTS">Sports</option>
                  <option value="CUSTOM">Custom Concession</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-stone-700">Type</Label>
                  <Select value={discountForm.discountType} onChange={e => setDiscountForm(f => ({ ...f, discountType: e.target.value }))} className="h-9 mt-1">
                    <option value="FIXED_AMOUNT">Fixed ₹</option>
                    <option value="PERCENTAGE">Percentage %</option>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-bold text-stone-700">Value *</Label>
                  <Input value={discountForm.value} onChange={e => setDiscountForm(f => ({ ...f, value: e.target.value }))} className="h-9 mt-1 font-bold" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold text-stone-700">Reason *</Label>
                <Input value={discountForm.reason} onChange={e => setDiscountForm(f => ({ ...f, reason: e.target.value }))} className="h-9 mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowDiscountModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleDiscount} disabled={pending} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold">Apply Concession</Button>
            </div>
          </div>
        </div>
      )}

      {/* WAIVE FINE MODAL */}
      {showFineModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-extrabold text-stone-900 text-sm">Waive Late Fee</h3>
              <button onClick={() => setShowFineModal(false)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <Label className="text-xs font-bold text-stone-700">Fine Record *</Label>
                <Select value={fineForm.fineId} onChange={e => {
                  const id = e.target.value; const f = profile?.fines?.find((x: any) => x.id === id);
                  setSelectedFineForWaiver(f); setFineForm(prev => ({ ...prev, fineId: id, waiveAmount: String(f?.finalAmount || "") }));
                }} className="h-9 mt-1">
                  <option value="">Select fine record…</option>
                  {profile?.fines?.filter((f: any) => f.status === "ACTIVE" && f.finalAmount > 0).map((f: any) => (
                    <option key={f.id} value={f.id}>{f.feeHeadName} ({f.month}) — ₹{f.finalAmount}</option>
                  ))}
                </Select></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="fullWaiver3" checked={fineForm.fullWaiver} onChange={e => setFineForm(f => ({ ...f, fullWaiver: e.target.checked }))} className="rounded text-indigo-600" />
                <label htmlFor="fullWaiver3" className="text-xs font-bold select-none cursor-pointer">100% Full Waiver</label>
              </div>
              {!fineForm.fullWaiver && (
                <div>
                  <Label className="text-xs font-bold text-stone-700">Waiver Amount (₹)</Label>
                  <Input value={fineForm.waiveAmount} onChange={e => setFineForm(f => ({ ...f, waiveAmount: e.target.value }))} className="h-9 mt-1 font-bold" />
                </div>
              )}
              <div>
                <Label className="text-xs font-bold text-stone-700">Reason *</Label>
                <Input value={fineForm.reason} onChange={e => setFineForm(f => ({ ...f, reason: e.target.value }))} className="h-9 mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowFineModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleWaiveFine} disabled={pending} className="bg-amber-600 hover:bg-amber-500 text-white font-bold">Confirm Waiver</Button>
            </div>
          </div>
        </div>
      )}

      {/* WALLET ACTIONS MODAL */}
      {showWalletModal && profile && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-extrabold text-stone-900 text-sm">Wallet Adjustment</h3>
              <button onClick={() => setShowWalletModal(false)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <Label className="text-xs font-bold">Action Type</Label>
                <Select value={walletForm.actionType} onChange={e => setWalletForm(f => ({ ...f, actionType: e.target.value }))} className="h-9 mt-1">
                  <option value="CREDIT">Deposit Advance (Credit)</option>
                  <option value="DEBIT">Refund to Parent (Debit)</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold">Amount (₹) *</Label>
                <Input value={walletForm.amount} onChange={e => setWalletForm(f => ({ ...f, amount: e.target.value }))} className="h-9 mt-1 font-bold" />
              </div>
              <div>
                <Label className="text-xs font-bold">Reason *</Label>
                <Input value={walletForm.reason} onChange={e => setWalletForm(f => ({ ...f, reason: e.target.value }))} className="h-9 mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowWalletModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleWallet} disabled={pending} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold">Submit</Button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT PREVIEW */}
      {receiptSnapshot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[95vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-stone-900">Official Fee Receipt</h3>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => window.print()} className="bg-stone-900 text-white h-7 text-xs"><Printer className="w-3.5 h-3.5 mr-1" /> Print</Button>
                <button onClick={() => setReceiptSnapshot(null)}><X className="w-5 h-5 text-stone-400" /></button>
              </div>
            </div>
            <div className="border border-stone-300 rounded-xl p-6 text-xs space-y-4">
              <div className="text-center border-b pb-3">
                <h2 className="text-lg font-black uppercase">{receiptSnapshot.branding?.schoolName || "Vidhyanjali Public School"}</h2>
                {receiptSnapshot.branding?.address && <p className="text-stone-500 text-[11px]">{receiptSnapshot.branding.address}</p>}
                <div className="mt-2 inline-block bg-stone-100 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase">FEE RECEIPT</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-700">
                <p><span className="font-bold">Receipt No:</span> {receiptSnapshot.receiptNo}</p>
                <p className="text-right"><span className="font-bold">Date:</span> {formatDate(receiptSnapshot.paidAt)}</p>
                <p><span className="font-bold">Mode:</span> {receiptSnapshot.method}</p>
              </div>
              <table className="w-full border-collapse border-y border-stone-200">
                <thead><tr className="bg-stone-100 text-[10px] font-bold uppercase text-stone-700">
                  <th className="py-2 px-2">Student</th><th className="py-2 px-2">Fee Head</th><th className="py-2 px-2 text-right">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {(receiptSnapshot.allocations || []).map((a: any, idx: number) => (
                    <tr key={idx}><td className="py-2 px-2 font-bold">{a.studentName}</td><td className="py-2 px-2">{a.feeHead}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold">{formatCurrency(a.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between font-bold text-sm pt-1">
                <span>Total Amount Paid:</span><span className="font-mono text-base">{receiptSnapshot.amountFormatted || formatCurrency(receiptSnapshot.amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

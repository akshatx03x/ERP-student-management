"use client";

import { useState, useCallback, useEffect, useRef, useTransition, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  Search, Download, FileText, Landmark, Wallet, RotateCcw,
  Tag, ChevronDown, ChevronRight, Plus, Ban, Loader2,
  ChevronsLeft, ChevronLeft, ChevronRight as ChevronRightIcon, ChevronsRight,
} from "lucide-react";
import {
  getReceiptRegisterAction,
  getCashBookAction,
  getDiscountRegisterAction,
  getRefundRegisterAction,
  getWalletRegisterAction,
  getWalletDetailAction,
  addCashBookEntryAction,
  voidCashBookEntryAction,
} from "@/server/actions/financial-reports.actions";
import { CashBookEntryType } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────
type Session = { id: string; name: string; isCurrent: boolean };
type ClassItem = { id: string; name: string; sections: { id: string; name: string }[] };

interface Props {
  sessions: Session[];
  classes: ClassItem[];
  currentSessionId: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
type TabId = "receipt" | "cashbook" | "discount" | "refund" | "wallet";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "receipt", label: "Receipt Register", icon: FileText },
  { id: "cashbook", label: "Cash Book", icon: Landmark },
  { id: "discount", label: "Discount Register", icon: Tag },
  { id: "refund", label: "Refund Register", icon: RotateCcw },
  { id: "wallet", label: "Wallet Register", icon: Wallet },
];

const PAYMENT_METHODS = ["CASH", "UPI", "CHEQUE", "BANK_TRANSFER", "WALLET_SETTLEMENT"];
const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", CHEQUE: "Cheque",
  BANK_TRANSFER: "Bank Transfer", WALLET_SETTLEMENT: "Wallet",
};

const ENTRY_TYPES: { value: CashBookEntryType; label: string; isCredit: boolean }[] = [
  { value: "MISC_INCOME", label: "Misc Income", isCredit: true },
  { value: "OTHER_INCOME", label: "Other Income", isCredit: true },
  { value: "MISC_EXPENSE", label: "Misc Expense", isCredit: false },
  { value: "PETTY_CASH", label: "Petty Cash", isCredit: false },
  { value: "ELECTRICITY_BILL", label: "Electricity Bill", isCredit: false },
  { value: "STATIONERY", label: "Stationery", isCredit: false },
  { value: "MAINTENANCE", label: "Maintenance", isCredit: false },
  { value: "SALARY_ADVANCE", label: "Salary Advance", isCredit: false },
  { value: "OTHER_EXPENSE", label: "Other Expense", isCredit: false },
];

const WALLET_TX_LABELS: Record<string, { label: string; color: string }> = {
  CREDIT_FROM_PAYMENT: { label: "Advance Deposit", color: "text-emerald-700" },
  CREDIT_NOTE_ADJUSTMENT: { label: "Credit Adjustment", color: "text-emerald-700" },
  DEBIT_FEE_SETTLEMENT: { label: "Fee Settlement", color: "text-indigo-700" },
  MANUAL_REFUND: { label: "Refund to Parent", color: "text-rose-700" },
  MANUAL_ADJUSTMENT: { label: "Manual Adjustment", color: "text-amber-700" },
};

// ── Shared helper components ───────────────────────────────────────────────────
function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    CASH: "bg-emerald-50 text-emerald-800 border-emerald-200",
    UPI: "bg-indigo-50 text-indigo-800 border-indigo-200",
    CHEQUE: "bg-amber-50 text-amber-800 border-amber-200",
    BANK_TRANSFER: "bg-blue-50 text-blue-800 border-blue-200",
    WALLET_SETTLEMENT: "bg-violet-50 text-violet-800 border-violet-200",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", colors[method] ?? "bg-stone-50 text-stone-700 border-stone-200")}>
      {METHOD_LABELS[method] ?? method}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SETTLED: "bg-emerald-50 text-emerald-800 border-emerald-200",
    PARTIAL: "bg-amber-50 text-amber-800 border-amber-200",
    ACTIVE: "bg-emerald-50 text-emerald-800 border-emerald-200",
    EXPIRED: "bg-stone-100 text-stone-500 border-stone-200",
    REVOKED: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", colors[status] ?? "bg-stone-50 text-stone-700 border-stone-200")}>
      {status}
    </span>
  );
}

function Pagination({
  page, pageSize, total, onPage,
}: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-t border-stone-200 bg-stone-50/50 text-xs text-stone-500 shrink-0">
      <span>{total.toLocaleString()} records</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(1)}
          className="p-1 rounded hover:bg-stone-200 disabled:opacity-30"><ChevronsLeft className="w-3.5 h-3.5" /></button>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="p-1 rounded hover:bg-stone-200 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
        <span className="px-2 font-semibold">{page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}
          className="p-1 rounded hover:bg-stone-200 disabled:opacity-30"><ChevronRightIcon className="w-3.5 h-3.5" /></button>
        <button disabled={page >= totalPages} onClick={() => onPage(totalPages)}
          className="p-1 rounded hover:bg-stone-200 disabled:opacity-30"><ChevronsRight className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function ReportsClient({ sessions, classes, currentSessionId }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("receipt");
  const [isPending, startTransition] = useTransition();

  // ── Filter state shared across tabs ──────────────────────────────────────
  const [sessionId, setSessionId] = useState(currentSessionId ?? "");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [page, setPage] = useState(1);

  // Get sections for selected class
  const sections = classes.find((c) => c.id === classId)?.sections ?? [];

  // ── Data state per tab ────────────────────────────────────────────────────
  const [receiptData, setReceiptData] = useState<any>(null);
  const [cashBookData, setCashBookData] = useState<any>(null);
  const [discountData, setDiscountData] = useState<any>(null);
  const [refundData, setRefundData] = useState<any>(null);
  const [walletData, setWalletData] = useState<any>(null);

  // Wallet expand state
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [walletDetail, setWalletDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Cash Book entry modal state
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryForm, setEntryForm] = useState({
    entryType: "MISC_EXPENSE" as CashBookEntryType,
    amount: "",
    description: "",
    remarks: "",
    voucherNo: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  // Void modal
  const [voidingEntry, setVoidingEntry] = useState<{ id: string; description: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  const searchDebounce = useRef<NodeJS.Timeout | null>(null);

  // ── Load data whenever filters / tab / page changes ───────────────────────
  const loadData = useCallback(() => {
    const filters = {
      sessionId: sessionId || undefined,
      classId: classId || undefined,
      sectionId: sectionId || undefined,
      search: search.trim() || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
      paymentMethod: paymentMethod || undefined,
      page,
      pageSize: 20,
    };

    startTransition(async () => {
      if (activeTab === "receipt") {
        const d = await getReceiptRegisterAction(filters);
        setReceiptData(d);
      } else if (activeTab === "cashbook") {
        const d = await getCashBookAction({ startDate: filters.startDate, endDate: filters.endDate, page, pageSize: 20 });
        setCashBookData(d);
      } else if (activeTab === "discount") {
        const d = await getDiscountRegisterAction(filters);
        setDiscountData(d);
      } else if (activeTab === "refund") {
        const d = await getRefundRegisterAction({ search: filters.search, startDate: filters.startDate, endDate: filters.endDate, page, pageSize: 20 });
        setRefundData(d);
      } else if (activeTab === "wallet") {
        const d = await getWalletRegisterAction({ sessionId: filters.sessionId, classId: filters.classId, sectionId: filters.sectionId, search: filters.search, page, pageSize: 20 });
        setWalletData(d);
      }
    });
  }, [activeTab, sessionId, classId, sectionId, search, startDate, endDate, paymentMethod, page]);

  // Load on tab/page change immediately
  useEffect(() => {
    loadData();
  }, [activeTab, page]);

  // Debounce for filter changes
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      if (page !== 1) setPage(1);
      else loadData();
    }, 350);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [search, sessionId, classId, sectionId, startDate, endDate, paymentMethod]);

  function switchTab(tab: TabId) {
    setActiveTab(tab);
    setPage(1);
    setSearch("");
    setExpandedFamily(null);
    setWalletDetail(null);
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function handleExport() {
    let header = "";
    let body = "";
    let filename = "report.csv";

    if (activeTab === "receipt" && receiptData?.items) {
      header = "Date,Receipt No,Method,Student(s),Class,Amount,Status,Collected By\n";
      body = receiptData.items.map((r: any) =>
        `"${formatDate(r.paidAt)}","${r.receiptNo}","${r.method}","${r.students.map((s: any) => s.name).join("; ")}","${r.students[0]?.classSection ?? ""}",${r.amount},"${r.status}","${r.recordedBy?.name ?? ""}"`
      ).join("\n");
      filename = "receipt-register.csv";
    } else if (activeTab === "cashbook" && cashBookData?.items) {
      header = "Date,Voucher No,Type,Description,Credit,Debit,Recorded By\n";
      body = cashBookData.items.map((r: any) =>
        `"${formatDate(r.date)}","${r.voucherNo ?? ""}","${r.transactionType}","${r.description}",${r.credit},${r.debit},"${r.recordedBy ?? ""}"`
      ).join("\n");
      filename = "cash-book.csv";
    } else if (activeTab === "discount" && discountData?.items) {
      header = "Date,Student,Admission No,Class,Fee Head,Type,Value,Category,Status,Approved By\n";
      body = discountData.items.map((d: any) =>
        `"${formatDate(d.createdAt)}","${d.studentName}","${d.admissionNo}","${d.classSection}","${d.feeHeadName}","${d.discountType}",${d.value},"${d.category}","${d.status}","${d.approvedBy}"`
      ).join("\n");
      filename = "discount-register.csv";
    } else if (activeTab === "refund" && refundData?.items) {
      header = "Date,Parent Name,Phone,Students,Refund Amount,Wallet Before,Wallet After,Reason,Processed By\n";
      body = refundData.items.map((r: any) =>
        `"${formatDate(r.createdAt)}","${r.fatherName}","${r.phone ?? ""}","${r.students.map((s: any) => s.fullName).join("; ")}",${r.refundAmount},${r.walletBefore},${r.walletAfter},"${r.reason}","${r.processedBy}"`
      ).join("\n");
      filename = "refund-register.csv";
    } else if (activeTab === "wallet" && walletData?.items) {
      header = "Parent Name,Phone,Children,Wallet Balance,Total Deposited,Total Utilized,Total Refunded\n";
      body = walletData.items.map((w: any) =>
        `"${w.fatherName}","${w.primaryPhone ?? ""}","${w.children.map((c: any) => c.fullName).join("; ")}",${w.walletBalance},${w.totalDeposited},${w.totalUtilized},${w.totalRefunded}`
      ).join("\n");
      filename = "wallet-register.csv";
    }

    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Wallet expand ─────────────────────────────────────────────────────────
  async function toggleFamily(familyId: string) {
    if (expandedFamily === familyId) {
      setExpandedFamily(null);
      setWalletDetail(null);
      return;
    }
    setExpandedFamily(familyId);
    setWalletDetail(null);
    setLoadingDetail(true);
    try {
      const detail = await getWalletDetailAction(familyId);
      setWalletDetail(detail);
    } finally {
      setLoadingDetail(false);
    }
  }

  // ── Cash Book entry submit ─────────────────────────────────────────────────
  async function handleAddEntry() {
    if (!entryForm.amount || !entryForm.description.trim()) return;
    setEntrySubmitting(true);
    try {
      await addCashBookEntryAction({
        entryType: entryForm.entryType,
        amount: Number(entryForm.amount),
        description: entryForm.description.trim(),
        remarks: entryForm.remarks.trim() || null,
        voucherNo: entryForm.voucherNo.trim() || null,
        date: entryForm.date ? new Date(entryForm.date) : undefined,
      });
      setShowAddEntry(false);
      setEntryForm({ entryType: "MISC_EXPENSE", amount: "", description: "", remarks: "", voucherNo: "", date: new Date().toISOString().slice(0, 10) });
      loadData();
    } finally {
      setEntrySubmitting(false);
    }
  }

  // ── Void entry ────────────────────────────────────────────────────────────
  async function handleVoid() {
    if (!voidingEntry || !voidReason.trim()) return;
    setVoidSubmitting(true);
    try {
      await voidCashBookEntryAction({ entryId: voidingEntry.id, voidReason: voidReason.trim() });
      setVoidingEntry(null);
      setVoidReason("");
      loadData();
    } finally {
      setVoidSubmitting(false);
    }
  }

  // ── Quick date presets ────────────────────────────────────────────────────
  function setDatePreset(preset: "today" | "yesterday" | "thisMonth") {
    const now = new Date();
    if (preset === "today") {
      const d = now.toISOString().slice(0, 10);
      setStartDate(d); setEndDate(d);
    } else if (preset === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const d = y.toISOString().slice(0, 10);
      setStartDate(d); setEndDate(d);
    } else if (preset === "thisMonth") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const e = now.toISOString().slice(0, 10);
      setStartDate(s); setEndDate(e);
    }
    setPage(1);
  }

  const currentData = activeTab === "receipt" ? receiptData
    : activeTab === "cashbook" ? cashBookData
    : activeTab === "discount" ? discountData
    : activeTab === "refund" ? refundData
    : walletData;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[calc(100vh-220px)] max-w-[1440px] mx-auto text-sm">

        {/* ── TABS HEADER ──────────────────────────────────────────────── */}
        <div className="bg-stone-50 border-b border-stone-200 px-5 py-3 flex justify-between items-center shrink-0">
          <div className="flex gap-1.5 flex-wrap">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all",
                    activeTab === tab.id
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-200/60"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" /> {tab.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "cashbook" && (
              <Button
                size="sm"
                onClick={() => setShowAddEntry(true)}
                className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Entry
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              className="h-8 text-xs font-semibold border-stone-300 rounded-lg"
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        {/* ── FILTER BAR ────────────────────────────────────────────────── */}
        <div className="border-b border-stone-200 px-5 py-2.5 bg-stone-50/50 shrink-0 flex flex-wrap gap-2 items-end">
          {/* Universal search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-stone-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, adm no, parents, phone…"
              className="pl-8 h-8 text-xs bg-white rounded-lg border-stone-300"
            />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white text-stone-700"
            />
            <span className="text-stone-400 text-xs">–</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white text-stone-700"
            />
          </div>

          {/* Date presets — only for cash-book and refund */}
          {(activeTab === "cashbook" || activeTab === "refund") && (
            <div className="flex gap-1">
              {(["today", "yesterday", "thisMonth"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setDatePreset(p)}
                  className="h-8 px-2.5 text-xs font-semibold border border-stone-300 rounded-lg bg-white text-stone-600 hover:bg-stone-100"
                >
                  {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : "This Month"}
                </button>
              ))}
            </div>
          )}

          {/* Session filter — receipt, discount, wallet */}
          {(activeTab === "receipt" || activeTab === "discount" || activeTab === "wallet") && sessions.length > 0 && (
            <select
              value={sessionId}
              onChange={(e) => { setSessionId(e.target.value); setPage(1); }}
              className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white text-stone-700"
            >
              <option value="">All Sessions</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          {/* Class filter */}
          {activeTab !== "cashbook" && activeTab !== "refund" && (
            <select
              value={classId}
              onChange={(e) => { setClassId(e.target.value); setSectionId(""); setPage(1); }}
              className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white text-stone-700"
            >
              <option value="">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {/* Section filter */}
          {activeTab !== "cashbook" && activeTab !== "refund" && classId && sections.length > 0 && (
            <select
              value={sectionId}
              onChange={(e) => { setSectionId(e.target.value); setPage(1); }}
              className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white text-stone-700"
            >
              <option value="">All Sections</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {/* Payment method — receipt only */}
          {activeTab === "receipt" && (
            <select
              value={paymentMethod}
              onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }}
              className="h-8 px-2 text-xs border border-stone-300 rounded-lg bg-white text-stone-700"
            >
              <option value="">All Methods</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </select>
          )}

          {isPending && <Loader2 className="w-4 h-4 animate-spin text-stone-400 ml-1" />}
        </div>

        {/* ── CASH BOOK SUMMARY BAR ─────────────────────────────────────── */}
        {activeTab === "cashbook" && cashBookData?.summary && (
          <div className="border-b border-stone-200 bg-stone-50/30 px-5 py-2.5 shrink-0 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            {[
              { label: "Opening Balance", value: cashBookData.summary.openingBalance, color: "text-stone-700" },
              { label: "Fee Collection", value: cashBookData.summary.totalFeeCollection, color: "text-emerald-700" },
              { label: "Wallet Deposits", value: cashBookData.summary.totalWalletDeposit, color: "text-indigo-700" },
              { label: "Misc Income", value: cashBookData.summary.totalMiscIncome, color: "text-emerald-700" },
              { label: "Refunds", value: cashBookData.summary.totalRefunds, color: "text-rose-700" },
              { label: "Misc Expenses", value: cashBookData.summary.totalMiscExpense, color: "text-rose-700" },
              { label: "Closing Balance", value: cashBookData.summary.closingBalance, color: "text-stone-900 font-bold" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col">
                <span className="text-stone-400 uppercase tracking-wide text-[9px] font-bold">{item.label}</span>
                <span className={cn("font-mono font-semibold", item.color)}>{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── TABLE AREA ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ══ RECEIPT REGISTER ════════════════════════════════════════ */}
          {activeTab === "receipt" && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Receipt No</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Student(s)</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Parent</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Collected By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {!receiptData ? (
                  <tr><td colSpan={9} className="p-8 text-center text-stone-400">Loading…</td></tr>
                ) : receiptData.items.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-stone-400">No receipts found</td></tr>
                ) : (
                  receiptData.items.map((r: any) => (
                    <tr key={r.id} className="hover:bg-stone-50/40">
                      <td className="py-2.5 px-4 text-stone-500">{formatDate(r.paidAt)}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-indigo-700">{r.receiptNo}</td>
                      <td className="py-2.5 px-4"><MethodBadge method={r.method} /></td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          {r.students.map((s: any, i: number) => (
                            <span key={i} className="font-semibold text-stone-800 truncate max-w-[160px]" title={s.name}>{s.name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-stone-600">{r.students[0]?.classSection ?? "—"}</td>
                      <td className="py-2.5 px-4 text-stone-600 truncate max-w-[130px]" title={r.family?.fatherName}>{r.family?.fatherName ?? "—"}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">{formatCurrency(r.amount)}</td>
                      <td className="py-2.5 px-4"><StatusBadge status={r.status} /></td>
                      <td className="py-2.5 px-4 text-stone-500">{r.recordedBy?.name ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* ══ CASH BOOK ═══════════════════════════════════════════════ */}
          {activeTab === "cashbook" && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Voucher No</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Remarks</th>
                  <th className="py-3 px-4 text-right text-emerald-700">Credit</th>
                  <th className="py-3 px-4 text-right text-rose-700">Debit</th>
                  <th className="py-3 px-4">Recorded By</th>
                  {/* void action column — only for CASH_BOOK entries */}
                  <th className="py-3 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {!cashBookData ? (
                  <tr><td colSpan={9} className="p-8 text-center text-stone-400">Loading…</td></tr>
                ) : cashBookData.items.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-stone-400">No transactions for this period</td></tr>
                ) : (
                  cashBookData.items.map((r: any) => (
                    <tr key={r.id} className={cn("hover:bg-stone-50/40", r.isVoided && "opacity-40 line-through")}>
                      <td className="py-2.5 px-4 text-stone-500">{formatDate(r.date)}</td>
                      <td className="py-2.5 px-4 font-mono text-stone-600">{r.voucherNo ?? "—"}</td>
                      <td className="py-2.5 px-4">
                        <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border",
                          r.sourceType === "FEE_PAYMENT" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : r.sourceType === "WALLET_TX" ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                        )}>
                          {r.transactionType}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-stone-700 max-w-[180px] truncate" title={r.description}>{r.description}</td>
                      <td className="py-2.5 px-4 text-stone-400 max-w-[120px] truncate">{r.remarks ?? "—"}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">
                        {r.credit > 0 ? formatCurrency(r.credit) : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-700">
                        {r.debit > 0 ? formatCurrency(r.debit) : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-stone-500">{r.recordedBy ?? "—"}</td>
                      <td className="py-2.5 px-4">
                        {r.sourceType === "CASH_BOOK" && !r.isVoided && (
                          <button
                            onClick={() => { setVoidingEntry({ id: r.id, description: r.description }); setVoidReason(""); }}
                            title="Void this entry"
                            className="p-1 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-700 transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {r.isVoided && (
                          <span className="text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">VOID</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* ══ DISCOUNT REGISTER ═══════════════════════════════════════ */}
          {activeTab === "discount" && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Adm. No</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Fee Head</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Value</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {!discountData ? (
                  <tr><td colSpan={10} className="p-8 text-center text-stone-400">Loading…</td></tr>
                ) : discountData.items.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-stone-400">No discounts found</td></tr>
                ) : (
                  discountData.items.map((d: any) => (
                    <tr key={d.id} className="hover:bg-stone-50/40">
                      <td className="py-2.5 px-4 text-stone-500">{formatDate(d.createdAt)}</td>
                      <td className="py-2.5 px-4 font-semibold text-stone-800 truncate max-w-[140px]" title={d.studentName}>{d.studentName}</td>
                      <td className="py-2.5 px-4 font-mono text-stone-600">{d.admissionNo}</td>
                      <td className="py-2.5 px-4 text-stone-600">{d.classSection}</td>
                      <td className="py-2.5 px-4 text-stone-700">{d.feeHeadName}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-violet-50 text-violet-800 border-violet-200">{d.category}</span>
                      </td>
                      <td className="py-2.5 px-4 text-stone-600">
                        {d.discountType === "PERCENTAGE" ? `${d.value}%` : `Flat`}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-indigo-700">
                        {d.discountType === "PERCENTAGE" ? `${d.value}%` : formatCurrency(d.value)}
                      </td>
                      <td className="py-2.5 px-4"><StatusBadge status={d.status} /></td>
                      <td className="py-2.5 px-4 text-stone-500">{d.approvedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* ══ REFUND REGISTER ═════════════════════════════════════════ */}
          {activeTab === "refund" && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Parent Name</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Student(s)</th>
                  <th className="py-3 px-4 text-right">Wallet Before</th>
                  <th className="py-3 px-4 text-right text-rose-700">Refund Amount</th>
                  <th className="py-3 px-4 text-right">Wallet After</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Processed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {!refundData ? (
                  <tr><td colSpan={9} className="p-8 text-center text-stone-400">Loading…</td></tr>
                ) : refundData.items.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-stone-400">No refunds found</td></tr>
                ) : (
                  refundData.items.map((r: any) => (
                    <tr key={r.id} className="hover:bg-stone-50/40">
                      <td className="py-2.5 px-4 text-stone-500">{formatDate(r.createdAt)}</td>
                      <td className="py-2.5 px-4 font-semibold text-stone-800">{r.fatherName}</td>
                      <td className="py-2.5 px-4 font-mono text-stone-500">{r.phone ?? "—"}</td>
                      <td className="py-2.5 px-4">
                        {r.students.map((s: any, i: number) => (
                          <div key={i} className="truncate max-w-[140px]" title={s.fullName}>
                            <span className="font-semibold text-stone-800">{s.fullName}</span>
                            <span className="text-stone-400 ml-1">({s.classSection})</span>
                          </div>
                        ))}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-stone-600">{formatCurrency(r.walletBefore)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-700">{formatCurrency(r.refundAmount)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-stone-600">{formatCurrency(r.walletAfter)}</td>
                      <td className="py-2.5 px-4 text-stone-600 max-w-[160px] truncate" title={r.reason}>{r.reason}</td>
                      <td className="py-2.5 px-4 text-stone-500">{r.processedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* ══ WALLET REGISTER ════════════════════════════════════════ */}
          {activeTab === "wallet" && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px] sticky top-0 z-10">
                  <th className="py-3 px-4 w-8"></th>
                  <th className="py-3 px-4">Parent</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Children</th>
                  <th className="py-3 px-4 text-right text-emerald-700">Deposited</th>
                  <th className="py-3 px-4 text-right text-indigo-700">Utilized</th>
                  <th className="py-3 px-4 text-right text-rose-700">Refunded</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {!walletData ? (
                  <tr><td colSpan={8} className="p-8 text-center text-stone-400">Loading…</td></tr>
                ) : walletData.items.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-stone-400">No wallet records found</td></tr>
                ) : (
                  walletData.items.map((w: any) => (
                    <Fragment key={w.familyId}>
                      {/* ── Summary row ── */}
                      <tr
                        className={cn("border-b border-stone-100 hover:bg-stone-50/50 cursor-pointer transition-colors",
                          expandedFamily === w.familyId && "bg-indigo-50/30")}
                        onClick={() => toggleFamily(w.familyId)}
                      >
                        <td className="py-3 px-4 text-stone-400">
                          {expandedFamily === w.familyId
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />}
                        </td>
                        <td className="py-3 px-4 font-semibold text-stone-900">{w.fatherName}</td>
                        <td className="py-3 px-4 font-mono text-stone-500">{w.primaryPhone ?? "—"}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {w.children.map((c: any) => (
                              <span key={c.id} className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded font-medium">
                                {c.fullName} <span className="text-stone-400">({c.classSection})</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700">{formatCurrency(w.totalDeposited)}</td>
                        <td className="py-3 px-4 text-right font-mono text-indigo-700">{formatCurrency(w.totalUtilized)}</td>
                        <td className="py-3 px-4 text-right font-mono text-rose-700">{formatCurrency(w.totalRefunded)}</td>
                        <td className={cn("py-3 px-4 text-right font-mono font-bold",
                          w.walletBalance > 0 ? "text-emerald-800" : "text-stone-400")}>
                          {formatCurrency(w.walletBalance)}
                        </td>
                      </tr>

                      {/* ── Expanded transaction history ── */}
                      {expandedFamily === w.familyId && (
                        <tr>
                          <td colSpan={8} className="p-0 bg-indigo-50/20 border-b border-indigo-100">
                            {loadingDetail ? (
                              <div className="flex items-center gap-2 px-10 py-4 text-stone-400">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading wallet history…
                              </div>
                            ) : walletDetail ? (
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="text-stone-400 font-bold uppercase text-[9px] border-b border-indigo-100">
                                    <th className="py-2 px-10">Date</th>
                                    <th className="py-2 px-4">Transaction Type</th>
                                    <th className="py-2 px-4">Child</th>
                                    <th className="py-2 px-4">Fee Head</th>
                                    <th className="py-2 px-4">Reason</th>
                                    <th className="py-2 px-4 text-right">Amount</th>
                                    <th className="py-2 px-4 text-right">Balance After</th>
                                    <th className="py-2 px-4">Recorded By</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-indigo-50">
                                  {walletDetail.transactions.map((tx: any) => {
                                    const txMeta = WALLET_TX_LABELS[tx.type] ?? { label: tx.type, color: "text-stone-700" };
                                    const isCredit = tx.type === "CREDIT_FROM_PAYMENT" || tx.type === "CREDIT_NOTE_ADJUSTMENT";
                                    return (
                                      <tr key={tx.id} className="hover:bg-indigo-50/30">
                                        <td className="py-2 px-10 text-stone-400">{formatDate(tx.createdAt)}</td>
                                        <td className="py-2 px-4">
                                          <span className={cn("font-bold", txMeta.color)}>{txMeta.label}</span>
                                        </td>
                                        <td className="py-2 px-4 text-stone-700">{tx.targetStudent?.fullName ?? "—"}</td>
                                        <td className="py-2 px-4 text-stone-500">{tx.feeHead ?? "—"}</td>
                                        <td className="py-2 px-4 text-stone-400 max-w-[160px] truncate" title={tx.reason}>{tx.reason}</td>
                                        <td className={cn("py-2 px-4 text-right font-mono font-bold", isCredit ? "text-emerald-700" : "text-rose-700")}>
                                          {isCredit ? "+" : "−"}{formatCurrency(tx.amount)}
                                        </td>
                                        <td className="py-2 px-4 text-right font-mono text-stone-600">{formatCurrency(tx.balanceAfter)}</td>
                                        <td className="py-2 px-4 text-stone-400">{tx.recordedBy}</td>
                                      </tr>
                                    );
                                  })}
                                  {walletDetail.transactions.length === 0 && (
                                    <tr><td colSpan={8} className="py-4 px-10 text-stone-400 text-center">No transactions</td></tr>
                                  )}
                                </tbody>
                              </table>
                            ) : null}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── PAGINATION ────────────────────────────────────────────────── */}
        {currentData && (
          <Pagination
            page={currentData.page ?? page}
            pageSize={currentData.pageSize ?? 20}
            total={currentData.total ?? 0}
            onPage={(p) => setPage(p)}
          />
        )}
      </div>

      {/* ══ ADD CASH BOOK ENTRY MODAL ════════════════════════════════════════ */}
      {showAddEntry && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
              <h3 className="font-extrabold text-stone-900 text-sm">Add Cash Book Entry</h3>
              <button onClick={() => setShowAddEntry(false)} className="text-stone-400 hover:text-stone-700 text-lg leading-none">×</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Date *</label>
                <input
                  type="date"
                  value={entryForm.date}
                  onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full h-9 px-3 border border-stone-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Entry Type *</label>
                <select
                  value={entryForm.entryType}
                  onChange={(e) => setEntryForm((f) => ({ ...f, entryType: e.target.value as CashBookEntryType }))}
                  className="w-full h-9 px-3 border border-stone-300 rounded-lg text-xs"
                >
                  {ENTRY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.isCredit ? "Income" : "Expense"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Amount (₹) *</label>
                <Input
                  type="number"
                  min="0"
                  value={entryForm.amount}
                  onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))}
                  className="h-9 text-xs font-bold"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Description *</label>
                <Input
                  value={entryForm.description}
                  onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-9 text-xs"
                  placeholder="Brief description"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Voucher No</label>
                <Input
                  value={entryForm.voucherNo}
                  onChange={(e) => setEntryForm((f) => ({ ...f, voucherNo: e.target.value }))}
                  className="h-9 text-xs"
                  placeholder="Optional voucher number"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-600 block mb-1">Remarks</label>
                <Input
                  value={entryForm.remarks}
                  onChange={(e) => setEntryForm((f) => ({ ...f, remarks: e.target.value }))}
                  className="h-9 text-xs"
                  placeholder="Optional remarks"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-stone-100 pt-4 mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowAddEntry(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleAddEntry}
                disabled={entrySubmitting || !entryForm.amount || !entryForm.description.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
              >
                {entrySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Entry"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ VOID CONFIRMATION MODAL ══════════════════════════════════════════ */}
      {voidingEntry && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                <Ban className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-stone-900 text-sm">Void Entry</h3>
                <p className="text-stone-500 text-xs">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-xs text-stone-600 mb-4 bg-stone-50 rounded-lg px-3 py-2 border border-stone-200">
              <span className="font-bold">Entry:</span> {voidingEntry.description}
            </p>
            <div className="mb-4">
              <label className="text-xs font-bold text-stone-600 block mb-1">Void Reason *</label>
              <Input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="h-9 text-xs"
                placeholder="Enter reason for voiding this entry"
                autoFocus
              />
              <p className="text-[10px] text-stone-400 mt-1">
                The entry will remain visible in the audit trail but will be excluded from all balances.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setVoidingEntry(null); setVoidReason(""); }}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleVoid}
                disabled={voidSubmitting || !voidReason.trim()}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold"
              >
                {voidSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Void Entry"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

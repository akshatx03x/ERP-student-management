"use client";

import { useState, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import {
  createFeeHeadAction,
  updateFeeHeadAction,
  createFeeStructureAction,
  checkFeeStructureRevisionImpactAction,
  applyFeeStructureRevisionAction,
} from "@/server/actions/fee.actions";
import { createFeeLateRuleAction } from "@/server/actions/fine.actions";
import { Plus, Trash, Pencil, Settings, Layers, Clock, CheckSquare, MinusSquare, Copy, AlertTriangle, ShieldCheck, Clock3, X } from "lucide-react";

import { FeeMonth } from "@prisma/client";
import type { FeeRevisionMode } from "@/server/validators/fee.validator";

type RevisionImpact = {
  structureId: string;
  className: string;
  sessionName: string;
  studentsAffected: number;
  totalRecords: number;
  fullyPaid: number;
  partiallyPaid: number;
  completelyUnpaid: number;
  hasExistingLedger: boolean;
  currentItems: Array<{ feeHeadId: string; feeHeadName: string; amount: number; months: FeeMonth[] }>;
};

type Session = { id: string; name: string };
type ClassRow = { id: string; name: string };
type Head = { id: string; name: string; description: string | null; isActive: boolean };
type Structure = {
  id: string;
  sessionId: string;
  classId: string;
  name: string;
  items: Array<{
    id: string;
    feeHeadId: string;
    amount: number;
    feeHead: { name: string };
    months: FeeMonth[];
  }>;
};
type Rule = {
  id: string; name: string; calculationType: string; graceDays: number;
  fixedAmount: number | null; percentage: number | null;
  applyPerDay: number | null; isActive: boolean;
};

const MONTH_ORDER: Array<{ label: string; value: FeeMonth }> = [
  { label: "Apr", value: FeeMonth.APRIL },
  { label: "May", value: FeeMonth.MAY },
  { label: "Jun", value: FeeMonth.JUNE },
  { label: "Jul", value: FeeMonth.JULY },
  { label: "Aug", value: FeeMonth.AUGUST },
  { label: "Sep", value: FeeMonth.SEPTEMBER },
  { label: "Oct", value: FeeMonth.OCTOBER },
  { label: "Nov", value: FeeMonth.NOVEMBER },
  { label: "Dec", value: FeeMonth.DECEMBER },
  { label: "Jan", value: FeeMonth.JANUARY },
  { label: "Feb", value: FeeMonth.FEBRUARY },
  { label: "Mar", value: FeeMonth.MARCH },
];

export function FeeSetupClient({
  sessions,
  currentSessionId,
  classes,
  heads: initialHeads,
  structures: initialStructures,
  rules: initialRules,
}: {
  sessions: Session[];
  currentSessionId: string | null;
  classes: ClassRow[];
  heads: Head[];
  structures: Structure[];
  rules: Rule[];
}) {
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"heads" | "structures" | "rules">("structures");

  // HEADS CRUD
  const [heads, setHeads] = useState<Head[]>(initialHeads);
  const [showHeadForm, setShowHeadForm] = useState(false);
  const [headName, setHeadName] = useState("");
  const [headDesc, setHeadDesc] = useState("");
  const [editingHeadId, setEditingHeadId] = useState<string | null>(null);
  const [editHeadName, setEditHeadName] = useState("");
  const [editHeadDesc, setEditHeadDesc] = useState("");

  // STRUCTURES EDITOR
  const [selectedSessionId, setSelectedSessionId] = useState<string>(currentSessionId ?? sessions[0]?.id ?? "");
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id ?? "");
  const [structures, setStructures] = useState<Structure[]>(initialStructures);
  
  const currentStructure = useMemo(() => {
    return structures.find(s => s.sessionId === selectedSessionId && s.classId === selectedClassId) ?? null;
  }, [structures, selectedSessionId, selectedClassId]);

  const [structItems, setStructItems] = useState<Array<{ feeHeadId: string; amount: string; months: FeeMonth[] }>>([]);
  const [structLoadedKey, setStructLoadedKey] = useState("");

  const structKey = `${selectedSessionId}:${selectedClassId}:${currentStructure?.id ?? "empty"}`;
  if (structLoadedKey !== structKey) {
    if (currentStructure) {
      setStructItems(currentStructure.items.map(i => ({
        feeHeadId: i.feeHeadId,
        amount: String(i.amount),
        months: (i.months || []) as FeeMonth[]
      })));
    } else {
      setStructItems([]);
    }
    setStructLoadedKey(structKey);
  }

  // RULES CONFIG
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleCalc, setRuleCalc] = useState("FIXED");
  const [ruleGrace, setRuleGrace] = useState("5");
  const [ruleValue, setRuleValue] = useState("");

  // REVISION DIALOG STATE
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionImpact, setRevisionImpact] = useState<RevisionImpact | null>(null);
  const [revisionMode, setRevisionMode] = useState<FeeRevisionMode>("FUTURE_ONLY");
  // Pending save payload — held until the admin confirms or cancels
  const [pendingRevisionItems, setPendingRevisionItems] = useState<Array<{ feeHeadId: string; amount: number; months: FeeMonth[] }>>([]);
  const [checkingImpact, setCheckingImpact] = useState(false);

  // Heads actions
  function handleAddHead() {
    if (!headName.trim()) { toast.error("Enter a name"); return; }
    startTransition(async () => {
      try {
        const r = await createFeeHeadAction({ name: headName.trim(), description: headDesc.trim() || null, isActive: true, frequency: "ANNUAL" });
        setHeads(prev => [...prev, r as Head].sort((a, b) => a.name.localeCompare(b.name)));
        setHeadName(""); setHeadDesc(""); setShowHeadForm(false);
        toast.success("Fee head master record created");
      } catch (e) { toast.error("Failed to create head"); }
    });
  }

  function handleUpdateHead(id: string) {
    if (!editHeadName.trim()) { toast.error("Name required"); return; }
    startTransition(async () => {
      try {
        const r = await updateFeeHeadAction({ id, name: editHeadName.trim(), description: editHeadDesc.trim() || null });
        setHeads(prev => prev.map(h => h.id === id ? { ...h, ...(r as Head) } : h));
        setEditingHeadId(null);
        toast.success("Fee head updated");
      } catch (e) { toast.error("Failed to update head"); }
    });
  }

  function handleToggleHeadStatus(h: Head) {
    startTransition(async () => {
      try {
        await updateFeeHeadAction({ id: h.id, isActive: !h.isActive });
        setHeads(prev => prev.map(x => x.id === h.id ? { ...x, isActive: !x.isActive } : x));
        toast.success("Status updated");
      } catch (e) { toast.error("Failed to update status"); }
    });
  }

  // Structures actions
  function handleAddStructRow() {
    const nextHead = heads.find(h => !structItems.some(x => x.feeHeadId === h.id));
    if (!nextHead) { toast.error("All fee heads are already mapped"); return; }
    setStructItems(prev => [...prev, { feeHeadId: nextHead.id, amount: "", months: MONTH_ORDER.map(m => m.value) }]);
  }

  /**
   * Two-phase save:
   * Phase 1 — Check if any StudentFee (monthly ledger) records already exist.
   *   - If NO records: save immediately, done.
   *   - If records exist: show the confirmation dialog with a preview.
   * Phase 2 — Admin picks FUTURE_ONLY or UPDATE_UNPAID and confirms.
   */
  async function handleSaveStructure() {
    if (structItems.length === 0) { toast.error("Add at least one fee head row"); return; }

    const selectedHeads = structItems.map(i => i.feeHeadId);
    if (new Set(selectedHeads).size !== selectedHeads.length) {
      toast.error("Duplicate fee heads are not allowed inside a fee structure.");
      return;
    }

    for (const row of structItems) {
      if (!row.amount || Number(row.amount) <= 0) { toast.error("Please enter a valid amount greater than zero"); return; }
      if (!row.months || row.months.length === 0) {
        toast.error("Please select at least one applicable month.");
        return;
      }
    }

    const items = structItems.map(i => ({
      feeHeadId: i.feeHeadId,
      amount: Number(i.amount),
      months: i.months,
    }));

    // ── Case A: New fee structure (no existing structure) ───────────────────
    if (!currentStructure) {
      startTransition(async () => {
        try {
          const payload = {
            sessionId: selectedSessionId,
            classId: selectedClassId,
            name: `${classes.find(c => c.id === selectedClassId)?.name} Structure`,
            items,
          };
          const r = await createFeeStructureAction(payload);
          toast.success("Fee structure created successfully");
          const ns: Structure = {
            id: r.id ?? Math.random().toString(),
            sessionId: selectedSessionId,
            classId: selectedClassId,
            name: payload.name,
            items: structItems.map(i => ({
              id: Math.random().toString(),
              feeHeadId: i.feeHeadId,
              amount: Number(i.amount),
              feeHead: { name: heads.find(h => h.id === i.feeHeadId)?.name ?? "" },
              months: i.months,
            })),
          };
          setStructures(prev => [...prev, ns]);
        } catch (e) {
          toast.error("Failed to save structure");
        }
      });
      return;
    }

    // ── Case B: Existing structure — check ledger impact first ──────────────
    setCheckingImpact(true);
    try {
      const impact = await checkFeeStructureRevisionImpactAction(currentStructure.id);

      if (!impact.hasExistingLedger) {
        // Case A behaviour: no ledger records, save immediately
        startTransition(async () => {
          try {
            const r = await applyFeeStructureRevisionAction({
              structureId: currentStructure.id,
              items,
              revisionMode: "FUTURE_ONLY",
            });
            toast.success("Fee structure saved successfully");
            setStructures(prev => prev.map(s => s.id === currentStructure.id ? {
              ...s,
              items: structItems.map((item, idx) => ({
                id: s.items[idx]?.id ?? Math.random().toString(),
                feeHeadId: item.feeHeadId,
                amount: Number(item.amount),
                feeHead: { name: heads.find(h => h.id === item.feeHeadId)?.name ?? "" },
                months: item.months,
              }))
            } : s));
          } catch (e) {
            toast.error("Failed to save structure");
          }
        });
      } else {
        // Ledger exists — show confirmation dialog
        setRevisionImpact(impact as RevisionImpact);
        setPendingRevisionItems(items);
        setRevisionMode("FUTURE_ONLY");
        setRevisionDialogOpen(true);
      }
    } catch (e) {
      toast.error("Failed to check fee structure impact. Please try again.");
    } finally {
      setCheckingImpact(false);
    }
  }

  /** Phase 2: Admin has chosen a mode in the dialog and clicked Apply. */
  function handleConfirmRevision() {
    if (!currentStructure || !revisionImpact) return;

    if (revisionMode === "UPDATE_UNPAID" && revisionImpact.completelyUnpaid === 0) {
      toast.info("No completely unpaid monthly records were eligible for update.");
      setRevisionDialogOpen(false);
      return;
    }

    startTransition(async () => {
      try {
        const r = await applyFeeStructureRevisionAction({
          structureId: currentStructure.id,
          items: pendingRevisionItems,
          revisionMode,
        });

        const modeLabel = revisionMode === "FUTURE_ONLY" ? "Future months" : "Unpaid months";
        const msg =
          revisionMode === "FUTURE_ONLY"
            ? `Fee structure saved. ${modeLabel} will use the new fee amounts. All existing ledger records are preserved.`
            : `Fee structure saved. ${r.stats.updatedLedgerRecords} unpaid record(s) updated. ${r.stats.totalSkipped} paid/partial record(s) preserved.`;
        toast.success(msg);

        setStructures(prev => prev.map(s => s.id === currentStructure.id ? {
          ...s,
          items: pendingRevisionItems.map((item, idx) => ({
            id: s.items[idx]?.id ?? Math.random().toString(),
            feeHeadId: item.feeHeadId,
            amount: item.amount,
            feeHead: { name: heads.find(h => h.id === item.feeHeadId)?.name ?? "" },
            months: item.months,
          }))
        } : s));

        setRevisionDialogOpen(false);
        setRevisionImpact(null);
        setPendingRevisionItems([]);
      } catch (e) {
        toast.error("Failed to apply fee structure revision. No data was changed.");
      }
    });
  }

  // Rules actions
  function handleSaveRule() {
    if (!ruleName.trim() || !ruleValue || !currentSessionId) { toast.error("Provide a name and value"); return; }
    startTransition(async () => {
      try {
        const val = Number(ruleValue);
        const payload = {
          sessionId: currentSessionId,
          name: ruleName.trim(),
          isActive: true,
          priority: 1,
          calculationType: ruleCalc as any,
          graceDays: Number(ruleGrace) || 0,
          fixedAmount: ruleCalc === "FIXED" ? val : undefined,
          percentage: ruleCalc === "PERCENTAGE" ? val : undefined,
          applyPerDay: ruleCalc === "PER_DAY" ? val : undefined,
        };
        const r = await createFeeLateRuleAction(payload);
        toast.success("Late fee rule created");
        setShowRuleForm(false);
        const nr: Rule = {
          id: r.ruleId ?? Math.random().toString(),
          name: payload.name,
          calculationType: payload.calculationType,
          graceDays: payload.graceDays,
          fixedAmount: payload.fixedAmount ?? null,
          percentage: payload.percentage ?? null,
          applyPerDay: payload.applyPerDay ?? null,
          isActive: true,
        };
        setRules(prev => [...prev, nr]);
        setRuleName(""); setRuleValue("");
      } catch (e) {
        toast.error("Failed to create rule");
      }
    });
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[calc(100vh-220px)] max-w-[1440px] mx-auto text-sm">

      {/* ── REVISION CONFIRMATION DIALOG ─────────────────────────────────── */}
      {revisionDialogOpen && revisionImpact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !pending && setRevisionDialogOpen(false)}
          />

          {/* Dialog panel */}
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-xl mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-stone-100">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-900 text-base leading-tight">Fee Structure Updated</h3>
                  <p className="text-xs text-stone-500 mt-1 leading-snug">
                    This fee structure already has generated monthly fee records.
                    Choose how you want to apply the new fee structure.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !pending && setRevisionDialogOpen(false)}
                className="text-stone-400 hover:text-stone-700 transition-colors ml-4 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview panel */}
            <div className="px-6 py-4 bg-stone-50/50 border-b border-stone-100">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">
                Impact Preview — {revisionImpact.className} · {revisionImpact.sessionName}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Students Affected", value: revisionImpact.studentsAffected, color: "text-stone-800" },
                  { label: "Existing Monthly Records", value: revisionImpact.totalRecords, color: "text-stone-800" },
                  { label: "Fully Paid", value: revisionImpact.fullyPaid, sub: "Will NOT change", color: "text-emerald-700" },
                  { label: "Partially Paid", value: revisionImpact.partiallyPaid, sub: "Will NOT change", color: "text-amber-700" },
                  { label: "Completely Unpaid", value: revisionImpact.completelyUnpaid, sub: "Eligible for update", color: "text-blue-700" },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-white border border-stone-200 rounded-xl px-3.5 py-3">
                    <p className="text-[10px] text-stone-500 font-semibold">{label}</p>
                    <p className={`text-lg font-extrabold mt-0.5 ${color}`}>{value.toLocaleString()}</p>
                    {sub && <p className="text-[9px] text-stone-400 font-semibold mt-0.5">{sub}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Mode selector */}
            <div className="px-6 py-4 space-y-2.5">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">Choose Revision Mode</p>

              {/* Option 1: Future Only */}
              <button
                onClick={() => setRevisionMode("FUTURE_ONLY")}
                className={cn(
                  "w-full text-left rounded-xl border p-4 transition-all",
                  revisionMode === "FUTURE_ONLY"
                    ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                    : "border-stone-200 hover:border-stone-300 bg-white"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                    revisionMode === "FUTURE_ONLY" ? "border-indigo-500" : "border-stone-300"
                  )}>
                    {revisionMode === "FUTURE_ONLY" && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock3 className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="font-bold text-stone-900 text-xs">Apply only to Future Months</span>
                      <Badge className="bg-indigo-100 text-indigo-700 border-none text-[9px] px-1.5 rounded-md">Recommended</Badge>
                    </div>
                    <p className="text-xs text-stone-500 mt-1 leading-snug">
                      Updates the fee structure template only. All existing monthly records stay exactly as they are.
                      New records generated in future will use the new fee amounts.
                    </p>
                    <p className="text-[10px] text-emerald-600 font-semibold mt-1.5 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Preserves all accounting history
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 2: Update Unpaid */}
              <button
                onClick={() => setRevisionMode("UPDATE_UNPAID")}
                className={cn(
                  "w-full text-left rounded-xl border p-4 transition-all",
                  revisionMode === "UPDATE_UNPAID"
                    ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500"
                    : "border-stone-200 hover:border-stone-300 bg-white"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                    revisionMode === "UPDATE_UNPAID" ? "border-blue-500" : "border-stone-300"
                  )}>
                    {revisionMode === "UPDATE_UNPAID" && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-bold text-stone-900 text-xs">Update All Completely Unpaid Months</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1 leading-snug">
                      Also updates {revisionImpact.completelyUnpaid.toLocaleString()} completely unpaid record(s)
                      (paid=₹0, no receipts, no transactions). Paid and partially paid records are permanently protected.
                    </p>
                    {revisionImpact.completelyUnpaid === 0 && (
                      <p className="text-[10px] text-amber-600 font-semibold mt-1.5">
                        No eligible unpaid records found — this mode will have no effect.
                      </p>
                    )}
                    <div className="flex gap-3 mt-2">
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" /> {revisionImpact.fullyPaid + revisionImpact.partiallyPaid} record(s) protected
                      </span>
                      <span className="text-[10px] text-blue-600 font-semibold">
                        {revisionImpact.completelyUnpaid} record(s) will update
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Action buttons */}
            <div className="px-6 pb-5 flex gap-2.5 justify-end border-t border-stone-100 pt-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => !pending && setRevisionDialogOpen(false)}
                disabled={pending}
                className="h-9 text-xs font-semibold text-stone-500 rounded-lg"
              >
                Cancel — No Changes
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmRevision}
                disabled={pending}
                className={cn(
                  "h-9 text-xs font-bold text-white rounded-lg min-w-[140px]",
                  revisionMode === "FUTURE_ONLY"
                    ? "bg-indigo-600 hover:bg-indigo-500"
                    : "bg-blue-600 hover:bg-blue-500"
                )}
              >
                {pending ? "Applying…" : "Apply Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TABS SELECTOR */}
      <div className="bg-stone-50 border-b border-stone-200 px-5 py-3 flex gap-2 shrink-0">
        {[
          { id: "structures", label: "Fee Structures", icon: Layers },
          { id: "heads", label: "Fee Heads", icon: Settings },
          { id: "rules", label: "Late Fee Rules", icon: Clock },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={cn("flex items-center gap-2 px-4.5 py-2 text-sm font-extrabold rounded-lg transition-all",
              activeTab === tab.id ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-200/50")}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden p-5">
        {/* T1: FEE HEADS */}
        {activeTab === "heads" && (
          <div className="flex flex-col h-full space-y-4">
            <div className="flex justify-between items-center shrink-0">
              <span className="text-xs text-stone-500 font-semibold">{heads.length} master fee heads configured</span>
              <Button size="sm" onClick={() => setShowHeadForm(true)} className="h-9 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold gap-1 rounded-lg">
                <Plus className="w-4 h-4" /> Add Fee Head
              </Button>
            </div>

            {showHeadForm && (
              <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/20 shrink-0 grid grid-cols-[240px_1fr_auto] gap-4 items-end">
                <div>
                  <Label className="text-xs font-bold text-stone-600">Head Name *</Label>
                  <Input value={headName} onChange={e => setHeadName(e.target.value)} placeholder="e.g. Activity Fee" className="h-9 text-xs mt-1.5 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-stone-600">Description</Label>
                  <Input value={headDesc} onChange={e => setHeadDesc(e.target.value)} placeholder="Short description…" className="h-9 text-xs mt-1.5 rounded-lg" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddHead} className="h-9 text-xs font-bold bg-indigo-600 text-white rounded-lg">Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowHeadForm(false)} className="h-9 text-xs text-stone-500 rounded-lg">Cancel</Button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-505 font-bold uppercase text-[10px] sticky top-0 z-10">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150">
                  {heads.map(h => (
                    <tr key={h.id} className="hover:bg-stone-50/50">
                      <td className="py-3.5 px-4 font-bold text-stone-900">
                        {editingHeadId === h.id ? (
                          <Input value={editHeadName} onChange={e => setEditHeadName(e.target.value)} className="h-8 text-xs w-56 font-bold rounded-lg" />
                        ) : h.name}
                      </td>
                      <td className="py-3.5 px-4 text-stone-500">
                        {editingHeadId === h.id ? (
                          <Input value={editHeadDesc} onChange={e => setEditHeadDesc(e.target.value)} className="h-8 text-xs w-72 rounded-lg" />
                        ) : h.description || "—"}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge onClick={() => handleToggleHeadStatus(h)} variant={h.isActive ? "success" : "secondary"} className="cursor-pointer text-[10px] rounded-md px-2 py-0.5">
                          {h.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {editingHeadId === h.id ? (
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" onClick={() => handleUpdateHead(h.id)} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg">Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingHeadId(null)} className="h-8 text-xs text-stone-500 rounded-lg">Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => { setEditingHeadId(h.id); setEditHeadName(h.name); setEditHeadDesc(h.description || ""); }} className="h-8 text-xs rounded-lg font-semibold text-indigo-600 hover:text-indigo-800">
                            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* T2: FEE STRUCTURES */}
        {activeTab === "structures" && (
          <div className="grid grid-cols-[200px_200px_1fr] gap-5 h-full overflow-hidden">
            {/* SESSION SELECTOR */}
            <div className="border border-stone-200 rounded-xl p-3 overflow-y-auto space-y-1.5 bg-stone-50/50">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-2">Sessions</span>
              {sessions.map(s => (
                <button key={s.id} onClick={() => setSelectedSessionId(s.id)}
                  className={cn("w-full text-left px-3 py-2 text-xs font-bold rounded-lg",
                    selectedSessionId === s.id ? "bg-indigo-600 text-white shadow-sm" : "text-stone-650 hover:bg-stone-200/50")}>
                  {s.name}
                </button>
              ))}
            </div>

            {/* CLASS SELECTOR */}
            <div className="border border-stone-200 rounded-xl p-3 overflow-y-auto space-y-1.5 bg-stone-50/50">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-2">Classes</span>
              {classes.map(c => {
                const hasStruct = structures.some(s => s.sessionId === selectedSessionId && s.classId === c.id);
                return (
                  <button key={c.id} onClick={() => setSelectedClassId(c.id)}
                    className={cn("w-full text-left px-3 py-2 text-xs font-bold rounded-lg flex justify-between items-center",
                      selectedClassId === c.id ? "bg-stone-900 text-white" : "text-stone-650 hover:bg-stone-200/50")}>
                    <span>{c.name}</span>
                    {hasStruct && <Badge className="bg-emerald-600 text-[9px] px-1.5 py-0 border-none shrink-0 rounded-md">Active</Badge>}
                  </button>
                );
              })}
            </div>

            {/* EXPANDED ERP-STYLE FEE STRUCTURE TABLE WITH MONTH MATRIX */}
            <div className="border border-stone-200 rounded-xl flex flex-col overflow-hidden bg-white shadow-xs">
              <div className="border-b px-5 py-4 bg-stone-50 flex justify-between items-center">
                <div>
                  <h4 className="font-extrabold text-stone-900 text-sm">Class Fee Structure Master</h4>
                  <p className="text-[11px] text-stone-505 mt-1">Session: {sessions.find(s => s.id === selectedSessionId)?.name} · Class: {classes.find(c => c.id === selectedClassId)?.name}</p>
                </div>
                <div className="flex gap-2.5">
                  <Button size="sm" onClick={handleAddStructRow} variant="outline" className="h-9 text-xs font-semibold border-stone-300 rounded-lg">
                    <Plus className="w-3.5 h-3.5 mr-1 text-indigo-650" /> Add Row
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveStructure}
                    disabled={pending || checkingImpact}
                    className="h-9 text-xs font-bold bg-indigo-600 text-white rounded-lg min-w-[110px]"
                  >
                    {checkingImpact ? "Checking…" : pending ? "Saving…" : "Save Structure"}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-0">
                <table className="w-full text-left text-xs border-collapse min-w-[950px]">
                  <thead className="sticky top-0 bg-stone-50 border-b border-stone-200 z-10">
                    <tr className="text-stone-500 font-bold uppercase text-[9px]">
                      <th className="py-3 px-3 w-48">Fee Head</th>
                      <th className="py-3 px-3 w-32">Amount</th>
                      {MONTH_ORDER.map(m => (
                        <th key={m.value} className="py-3 px-1 text-center w-10">{m.label}</th>
                      ))}
                      <th className="py-3 px-3 text-right w-44">Row Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-xs">
                    {structItems.length === 0 ? (
                      <tr>
                        <td colSpan={15} className="p-8 text-center text-stone-400 text-xs font-semibold">
                          No billing items configured. Click 'Add Row' to begin constructing this class fee structure.
                        </td>
                      </tr>
                    ) : (
                      structItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-stone-50/50">
                          <td className="py-2.5 px-3">
                            <Select value={item.feeHeadId}
                              onChange={e => {
                                const newId = e.target.value;
                                setStructItems(prev => prev.map((x, i) => i === idx ? { ...x, feeHeadId: newId } : x));
                              }} className="h-9 text-xs w-full rounded-lg">
                              {heads.map(h => (
                                <option key={h.id} value={h.id} disabled={structItems.some((e, eidx) => e.feeHeadId === h.id && eidx !== idx)}>
                                  {h.name}
                                </option>
                              ))}
                            </Select>
                          </td>
                          
                          <td className="py-2.5 px-3">
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-stone-400 text-xs font-bold">₹</span>
                              <Input value={item.amount} onChange={e => {
                                const v = e.target.value;
                                setStructItems(prev => prev.map((x, i) => i === idx ? { ...x, amount: v } : x));
                              }} className="pl-6 h-9 text-xs font-bold rounded-lg" placeholder="0" />
                            </div>
                          </td>

                          {MONTH_ORDER.map(m => {
                            const isChecked = item.months.includes(m.value);
                            return (
                              <td key={m.value} className="py-2.5 px-1 text-center">
                                <input type="checkbox" checked={isChecked}
                                  onChange={() => {
                                    const nextMonths = isChecked
                                      ? item.months.filter(x => x !== m.value)
                                      : [...item.months, m.value];
                                    setStructItems(prev => prev.map((x, i) => i === idx ? { ...x, months: nextMonths } : x));
                                  }} className="rounded border-stone-350 text-indigo-650 w-4 h-4 cursor-pointer align-middle" />
                              </td>
                            );
                          })}

                          <td className="py-2.5 px-3 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" title="Select All Months"
                                onClick={() => {
                                  setStructItems(prev => prev.map((x, i) => i === idx ? { ...x, months: MONTH_ORDER.map(m => m.value) } : x));
                                }} className="h-8 w-8 p-0 text-stone-500 hover:text-stone-900 rounded-lg">
                                <CheckSquare className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Clear All Months"
                                onClick={() => {
                                  setStructItems(prev => prev.map((x, i) => i === idx ? { ...x, months: [] } : x));
                                }} className="h-8 w-8 p-0 text-stone-500 hover:text-stone-900 rounded-lg">
                                <MinusSquare className="w-4 h-4" />
                              </Button>
                              {idx > 0 && (
                                <Button size="sm" variant="ghost" title="Copy Months from Previous Row"
                                  onClick={() => {
                                    const prevRowMonths = structItems[idx - 1].months;
                                    setStructItems(prev => prev.map((x, i) => i === idx ? { ...x, months: [...prevRowMonths] } : x));
                                  }} className="h-8 w-8 p-0 text-stone-500 hover:text-stone-900 rounded-lg">
                                  <Copy className="w-4 h-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" title="Delete Row"
                                onClick={() => setStructItems(p => p.filter((_, i) => i !== idx))}
                                className="h-8 w-8 p-0 text-stone-400 hover:text-rose-600 rounded-lg">
                                <Trash className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* T3: LATE FEE RULES */}
        {activeTab === "rules" && (
          <div className="flex flex-col h-full space-y-4">
            <div className="flex justify-between items-center shrink-0">
              <span className="text-xs text-stone-500 font-semibold">{rules.length} late fee calculation rules active</span>
              <Button size="sm" onClick={() => setShowRuleForm(true)} className="h-9 text-xs bg-indigo-600 text-white font-bold gap-1 rounded-lg">
                <Plus className="w-4 h-4" /> Add Late Rule
              </Button>
            </div>

            {showRuleForm && (
              <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/20 shrink-0 space-y-4">
                <p className="text-xs font-bold text-indigo-900">New Late Fee Rule</p>
                <div className="grid grid-cols-4 gap-4 text-xs">
                  <div>
                    <Label className="text-xs font-bold">Rule Name *</Label>
                    <Input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="e.g. Standard 5-day fine" className="h-9 text-xs mt-1.5 rounded-lg" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Calculation Mode *</Label>
                    <Select value={ruleCalc} onChange={e => setRuleCalc(e.target.value)} className="h-9 text-xs mt-1.5 rounded-lg">
                      <option value="FIXED">Fixed Amount (₹)</option>
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="PER_DAY">Daily Rate (₹/day)</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Grace Days *</Label>
                    <Input value={ruleGrace} onChange={e => setRuleGrace(e.target.value)} type="number" className="h-9 text-xs mt-1.5 rounded-lg" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Fine Value *</Label>
                    <Input value={ruleValue} onChange={e => setRuleValue(e.target.value)} placeholder="e.g. 100" className="h-9 text-xs mt-1.5 font-bold rounded-lg" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveRule} className="h-9 text-xs font-bold bg-indigo-600 text-white rounded-lg">Save Rule</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowRuleForm(false)} className="h-9 text-xs text-stone-500 rounded-lg">Cancel</Button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[9px] sticky top-0 z-10">
                    <th className="py-2.5 px-4">Rule Name</th>
                    <th className="py-2.5 px-4">Calculation Mode</th>
                    <th className="py-2.5 px-4">Grace Days</th>
                    <th className="py-2.5 px-4 text-right">Value</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rules.map(r => (
                    <tr key={r.id} className="hover:bg-stone-50/50">
                      <td className="py-3 px-4 font-bold text-stone-900">{r.name}</td>
                      <td className="py-3 px-4"><Badge variant="outline" className="rounded-md">{r.calculationType}</Badge></td>
                      <td className="py-3 px-4 font-semibold text-stone-700">{r.graceDays} day(s)</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-stone-850">
                        {r.fixedAmount !== null && formatCurrency(r.fixedAmount)}
                        {r.percentage !== null && `${r.percentage}%`}
                        {r.applyPerDay !== null && `${formatCurrency(r.applyPerDay)} / day`}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={r.isActive ? "success" : "secondary"} className="rounded-md px-2 py-0.5">{r.isActive ? "Active" : "Inactive"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

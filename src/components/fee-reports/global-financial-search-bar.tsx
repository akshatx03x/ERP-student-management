"use client";

import { useState } from "react";
import { searchFinancialRecordsAction } from "@/server/actions/financial-reports.actions";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Search, User, FileText, Users } from "lucide-react";
import Link from "next/link";

export function GlobalFinancialSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (val: string) => {
    setQuery(val);
    if (val.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await searchFinancialRecordsAction(val);
      setResults(res);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search name, adm no, parents, phone, receipt #..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 bg-slate-900/60 border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500"
        />
      </div>

      {results && (
        <Card className="absolute left-0 right-0 top-11 z-50 bg-slate-900 border-slate-800 shadow-2xl overflow-hidden max-h-96 overflow-y-auto">
          <CardContent className="p-3 space-y-3 text-xs">
            {/* Students */}
            {results.students.length > 0 && (
              <div>
                <p className="text-[10px] uppercase font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5">
                  <User className="w-3 h-3" /> Students
                </p>
                <div className="space-y-1">
                  {results.students.map((s: any) => (
                    <Link
                      key={s.id}
                      href={`/students/${s.id}`}
                      className="block p-2 rounded hover:bg-slate-800/80 transition-colors flex justify-between items-center"
                    >
                      <span className="font-semibold text-slate-200">{s.fullName}</span>
                      <span className="text-slate-400 font-mono">{s.admissionNo}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Receipts */}
            {results.receipts.length > 0 && (
              <div>
                <p className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5 mb-1.5">
                  <FileText className="w-3 h-3" /> Payments / Receipts
                </p>
                <div className="space-y-1">
                  {results.receipts.map((r: any) => (
                    <div key={r.id} className="p-2 rounded bg-slate-950/40 border border-slate-800/50 flex justify-between items-center">
                      <div>
                        <span className="font-mono font-bold text-indigo-300">{r.receiptNo}</span>
                        <span className="text-slate-400 ml-2">({r.method})</span>
                      </div>
                      <span className="font-bold text-emerald-300">{formatCurrency(r.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Families */}
            {results.families.length > 0 && (
              <div>
                <p className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1.5 mb-1.5">
                  <Users className="w-3 h-3" /> Families
                </p>
                <div className="space-y-1">
                  {results.families.map((f: any) => (
                    <div key={f.id} className="p-2 rounded bg-slate-950/40 border border-slate-800/50 flex justify-between items-center">
                      <span className="font-semibold text-slate-200">{f.fatherName}</span>
                      <span className="text-slate-400">{f.primaryPhone}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.students.length === 0 && results.receipts.length === 0 && results.families.length === 0 && (
              <p className="text-slate-500 text-center py-3">No matching financial records found.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

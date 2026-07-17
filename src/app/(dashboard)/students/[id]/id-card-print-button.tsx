"use client";

export function IdCardPrintButton() {
  return (
    <button
      type="button"
      className="no-print mt-3 text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
      onClick={() => window.print()}
    >
      Print ID card
    </button>
  );
}

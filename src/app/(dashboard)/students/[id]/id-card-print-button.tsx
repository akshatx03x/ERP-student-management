"use client";

export function IdCardPrintButton() {
  return (
    <button
      type="button"
      className="no-print mt-3 text-sm text-primary hover:underline"
      onClick={() => window.print()}
    >
      Print ID card
    </button>
  );
}

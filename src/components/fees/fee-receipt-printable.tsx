"use client";

import React from "react";
import { SingleFeeReceipt, FeeReceiptData } from "./fee-receipt-single";

interface FeeReceiptPrintableProps {
  data: FeeReceiptData;
}

export function FeeReceiptPrintable({ data }: FeeReceiptPrintableProps) {
  return (
    <div className="fee-receipt-print-wrapper bg-stone-100 p-4 min-h-screen flex flex-col items-center justify-start print:p-0 print:bg-white print:min-h-0">
      {/* SCREEN PRINT BAR */}
      <div className="no-print bg-stone-900 text-white w-full max-w-[195mm] p-3 rounded-lg mb-4 flex items-center justify-between shadow-md">
        <div>
          <h2 className="font-extrabold text-sm uppercase">Fee Receipt #{data.receiptNumber || data.receiptNo}</h2>
          <p className="text-stone-400 text-xs">Contains School Copy (Left) and Parent Copy (Right)</p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span>🖨️</span> Print Receipt
        </button>
      </div>

      {/* DUAL COPY CONTAINER - SIDE BY SIDE (SCHOOL COPY LEFT / PARENT COPY RIGHT) */}
      <div
        className="receipt-unit-wrapper fee-receipt-container print:w-full print:max-w-none"
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "stretch",
          width: "100%",
          maxWidth: "195mm",
          backgroundColor: "#ffffff",
          boxSizing: "border-box",
          pageBreakInside: "avoid",
          breakInside: "avoid",
        }}
      >
        {/* SCHOOL COPY (LEFT) */}
        <SingleFeeReceipt data={data} copyType="SCHOOL COPY" isSideBySide={true} />

        {/* VERTICAL CUT LINE DIVIDER (CENTER) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "3%",
            userSelect: "none",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "100%",
              borderLeft: "2px dashed #a8a29e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                writingMode: "vertical-rl",
                textTransform: "uppercase",
                fontSize: "7.5px",
                fontWeight: 800,
                color: "#78716c",
                letterSpacing: "2px",
                backgroundColor: "#ffffff",
                padding: "8px 0",
              }}
            >
              ✂ CUT HERE (SCHOOL LEFT / PARENT RIGHT) ✂
            </span>
          </div>
        </div>

        {/* PARENT COPY (RIGHT) */}
        <SingleFeeReceipt data={data} copyType="PARENT COPY" isSideBySide={true} />
      </div>

      {/* DEDICATED PRINT STYLES */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 5mm;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          header, nav, aside, .sidebar, .erp-header {
            display: none !important;
          }
          .fee-receipt-print-wrapper {
            background-color: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .fee-receipt-container, .receipt-unit-wrapper {
            max-width: 100% !important;
            width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 4mm !important;
          }
        }
      `}</style>
    </div>
  );
}

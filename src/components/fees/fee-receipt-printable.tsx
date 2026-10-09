"use client";

import React from "react";
import { SingleFeeReceipt, FeeReceiptData, getReceiptFileName } from "./fee-receipt-single";
import { printReceipt } from "./receipt-printer";

interface FeeReceiptPrintableProps {
  data: FeeReceiptData;
}

export function FeeReceiptPrintable({ data }: FeeReceiptPrintableProps) {
  const receiptRef = React.useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);

  const handleDownloadPDF = async () => {
    if (!receiptRef.current) return;
    setIsDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");

      let imgData = "";
      let imgWidth = 0;
      let imgHeight = 0;

      try {
        const { toPng } = await import("html-to-image");
        imgData = await toPng(receiptRef.current, {
          pixelRatio: 2,
          backgroundColor: "#ffffff",
          cacheBust: true,
        });

        const img = new Image();
        img.src = imgData;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        imgWidth = img.width;
        imgHeight = img.height;
      } catch (imgErr) {
        console.warn("html-to-image fallback to html2canvas:", imgErr);
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(receiptRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          scrollX: 0,
          scrollY: 0,
          logging: false,
        });
        imgData = canvas.toDataURL("image/png");
        imgWidth = canvas.width;
        imgHeight = canvas.height;
      }

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const margin = 5;
      const printableWidth = pdfWidth - margin * 2;
      const printableHeight = (imgHeight * printableWidth) / imgWidth;

      pdf.addImage(imgData, "PNG", margin, margin, printableWidth, printableHeight);

      const fileName = getReceiptFileName(data, ".pdf");
      pdf.save(fileName);
    } catch (e) {
      console.error("PDF download fallback to print:", e);
      printReceipt(data);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fee-receipt-print-wrapper bg-stone-100 p-4 min-h-screen flex flex-col items-center justify-start print:p-0 print:bg-white print:min-h-0">
      {/* SCREEN PRINT BAR */}
      <div className="no-print bg-stone-900 text-white w-full max-w-[195mm] p-3 rounded-lg mb-4 flex items-center justify-between shadow-md">
        <div>
          <h2 className="font-extrabold text-sm uppercase">Fee Receipt #{data.receiptNumber || data.receiptNo}</h2>
          <p className="text-stone-400 text-xs">Contains School Copy (Left) and Parent Copy (Right)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="bg-stone-700 hover:bg-stone-600 text-white font-bold px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>📥</span> {isDownloading ? "Downloading..." : "Download PDF"}
          </button>
          <button
            onClick={() => printReceipt(data)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>🖨️</span> Print Receipt
          </button>
        </div>
      </div>

      {/* DUAL COPY CONTAINER - SIDE BY SIDE (SCHOOL COPY LEFT / PARENT COPY RIGHT) */}
      <div
        ref={receiptRef}
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
              - - CUT HERE - -
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
          /* Show ONLY the fee receipt printable wrapper and all its contents */
          .fee-receipt-print-wrapper,
          .fee-receipt-print-wrapper * {
            visibility: visible !important;
          }
          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }
          /* Position printable wrapper at top-left of physical A4 page */
          .fee-receipt-print-wrapper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            background-color: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .fee-receipt-container, .receipt-unit-wrapper {
            max-width: 100% !important;
            width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

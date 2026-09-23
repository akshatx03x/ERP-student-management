"use client";

import React from "react";
import { formatCurrency, formatDate, numberToWords } from "@/lib/utils";

export interface FeeReceiptData {
  receiptNo?: string;
  receiptNumber?: number | string | null;
  paidAt?: Date | string;
  amount?: number;
  amountFormatted?: string;
  method?: string;
  referenceNo?: string | null;
  notes?: string | null;
  branding?: {
    schoolName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    receiptFooter?: string | null;
    logoDocumentId?: string | null;
  } | null;
  family?: {
    fatherName?: string | null;
    motherName?: string | null;
    primaryPhone?: string | null;
  } | null;
  allocations?: Array<{
    studentName?: string;
    admissionNo?: string;
    fatherName?: string | null;
    className?: string | null;
    feeHead?: string;
    month?: string | null;
    dueYear?: number | null;
    amount?: number;
    amountFormatted?: string;
  }>;
  recordedBy?: string | null;
  studentDuesBalance?: number;
}

interface SingleReceiptProps {
  data: FeeReceiptData;
  copyType: "SCHOOL COPY" | "PARENT COPY";
  isSideBySide?: boolean;
}

function formatMonthName(monthStr: string): string {
  if (!monthStr) return "";
  const m = monthStr.toUpperCase();
  return m.charAt(0) + m.slice(1).toLowerCase();
}

export function SingleFeeReceipt({ data, copyType, isSideBySide = true }: SingleReceiptProps) {
  const receiptDisplayNo = data.receiptNumber
    ? String(data.receiptNumber)
    : data.receiptNo || "10001";

  const dateStr = formatDate(data.paidAt);
  const allocations = data.allocations || [];

  const studentName = allocations[0]?.studentName || "Student";
  const admissionNo = allocations[0]?.admissionNo || "—";
  const fatherName = allocations[0]?.fatherName || data.family?.fatherName || "—";
  const className = allocations[0]?.className || "—";

  // Aggregate identical fee heads across months
  const feeHeadMap = new Map<string, number>();
  const monthsSet = new Set<string>();

  for (const alloc of allocations) {
    const headName = alloc.feeHead || "General Fee";
    const amt = alloc.amount || 0;
    feeHeadMap.set(headName, (feeHeadMap.get(headName) || 0) + amt);

    if (alloc.month) {
      const formattedM = formatMonthName(alloc.month);
      const yearSuffix = alloc.dueYear ? ` ${alloc.dueYear}` : "";
      monthsSet.add(`${formattedM}${yearSuffix}`);
    }
  }

  const aggregatedRows = Array.from(feeHeadMap.entries()).map(([head, totalAmt]) => ({
    feeHead: head,
    amount: totalAmt,
  }));

  const monthsList = Array.from(monthsSet);
  const monthsText = monthsList.length > 0
    ? monthsList.join(", ")
    : "All Session Months (April 2026 - March 2027)";

  const totalPaid = data.amount || aggregatedRows.reduce((sum, r) => sum + r.amount, 0);
  const totalTableFee = aggregatedRows.reduce((sum, r) => sum + r.amount, 0);
  const balance = data.studentDuesBalance !== undefined ? data.studentDuesBalance : 0;
  const wordsText = numberToWords(totalPaid);

  return (
    <div
      className="single-receipt-card"
      style={{
        width: isSideBySide ? "48.5%" : "100%",
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        border: "1.5px solid #1c1917",
        color: "#1c1917",
        padding: "6px 8px",
        fontSize: "9.5px",
        lineHeight: "1.15",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* HEADER SECTION - NO POSTAL ADDRESS, STYLIZED BRANDING */}
      <div style={{ borderBottom: "1.5px solid #1c1917", paddingBottom: "3px", marginBottom: "5px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ backgroundColor: "#1c1917", color: "#ffffff", fontWeight: 800, padding: "1.5px 5px", fontSize: "8px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
            {copyType}
          </span>
          <div style={{ textAlign: "center", flex: 1, padding: "0 4px" }}>
            <div style={{ display: "inline-block", lineHeight: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.8px", color: "#000000" }}>
                VIDYANJALI
              </div>
              <div style={{ fontSize: "9.5px", fontWeight: 700, fontStyle: "italic", color: "#1c1917", letterSpacing: "0.3px", marginTop: "1px" }}>
                Public School
              </div>
            </div>
          </div>
          <span style={{ border: "1px solid #1c1917", fontWeight: 700, padding: "1.5px 5px", fontSize: "8px", textTransform: "uppercase", backgroundColor: "#f5f5f4", color: "#000000" }}>
            FEE RECEIPT
          </span>
        </div>
      </div>

      {/* METADATA GRID - TIGHT, PERFECTLY ALIGNED 2-COLUMN LAYOUT */}
      <div style={{ border: "1px solid #d6d3d1", backgroundColor: "#fafaf9", padding: "4px 5px", borderRadius: "2px", marginBottom: "5px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px" }}>
          <div>
            <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Receipt No</span>
            <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#000000", fontSize: "11px", display: "block", lineHeight: "1.2" }}>#{receiptDisplayNo}</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Date</span>
            <span style={{ fontWeight: 700, color: "#000000", fontSize: "9px", display: "block", lineHeight: "1.2" }}>{dateStr}</span>
          </div>

          <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: "3px" }}>
            <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Student Name</span>
            <span style={{ fontWeight: 800, color: "#000000", textTransform: "uppercase", fontSize: "10px", wordBreak: "break-word", display: "block", lineHeight: "1.2" }}>{studentName}</span>
          </div>
          <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: "3px", textAlign: "right" }}>
            <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Class & Sec</span>
            <span style={{ fontWeight: 700, color: "#000000", textTransform: "uppercase", fontSize: "9px", display: "block", lineHeight: "1.2" }}>{className}</span>
          </div>

          <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: "3px" }}>
            <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Father's Name</span>
            <span style={{ fontWeight: 700, color: "#000000", textTransform: "uppercase", fontSize: "9px", wordBreak: "break-word", display: "block", lineHeight: "1.2" }}>{fatherName}</span>
          </div>
          <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: "3px", textAlign: "right" }}>
            <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Admission No</span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#000000", fontSize: "9px", display: "block", lineHeight: "1.2" }}>{admissionNo}</span>
          </div>

          <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: "3px" }}>
            <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Payment Mode</span>
            <span style={{ fontWeight: 700, color: "#000000", textTransform: "uppercase", fontSize: "8.5px", display: "block", lineHeight: "1.2" }}>{data.method || "CASH"} {data.referenceNo ? `(${data.referenceNo})` : ""}</span>
          </div>
          <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: "3px", textAlign: "right" }}>
            <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Session</span>
            <span style={{ fontWeight: 700, color: "#000000", fontSize: "9px", display: "block", lineHeight: "1.2" }}>2026-2027</span>
          </div>
        </div>
      </div>

      {/* FEE PARTICULAR TABLE */}
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", border: "1px solid #1c1917", marginBottom: "5px", fontSize: "9px" }}>
        <thead>
          <tr style={{ backgroundColor: "#e7e5e4", borderBottom: "1px solid #1c1917", fontSize: "8px", fontWeight: 900, textTransform: "uppercase", color: "#1c1917" }}>
            <th style={{ padding: "3px 4px", borderRight: "1px solid #1c1917", width: "22px", textAlign: "center", lineHeight: "1.2" }}>S.N.</th>
            <th style={{ padding: "3px 5px", borderRight: "1px solid #1c1917", textAlign: "left", lineHeight: "1.2" }}>Particulars / Fee Head</th>
            <th style={{ padding: "3px 5px", textAlign: "right", width: "65px", lineHeight: "1.2" }}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {aggregatedRows.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ padding: "6px", textAlign: "center", color: "#78716c", lineHeight: "1.2" }}>No fee heads specified</td>
            </tr>
          ) : (
            aggregatedRows.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #e7e5e4" }}>
                <td style={{ padding: "3px 4px", borderRight: "1px solid #e7e5e4", textAlign: "center", fontWeight: 700, color: "#57534e", lineHeight: "1.2" }}>{idx + 1}</td>
                <td style={{ padding: "3px 5px", borderRight: "1px solid #e7e5e4", fontWeight: 700, color: "#1c1917", textTransform: "uppercase", wordBreak: "break-word", lineHeight: "1.2" }}>{row.feeHead}</td>
                <td style={{ padding: "3px 5px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#000000", lineHeight: "1.2" }}>{row.amount.toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1.5px solid #1c1917", backgroundColor: "#f5f5f4", fontWeight: 800, fontSize: "9px" }}>
            <td colSpan={2} style={{ padding: "3px 5px", textAlign: "right", textTransform: "uppercase", borderRight: "1px solid #1c1917", lineHeight: "1.2" }}>Total Particulars:</td>
            <td style={{ padding: "3px 5px", textAlign: "right", fontFamily: "monospace", fontWeight: 900, color: "#000000", lineHeight: "1.2" }}>{totalTableFee.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      {/* MONTHS COVERED SECTION - FULL WIDTH WITH ZERO OVERLAP */}
      <div style={{ border: "1px solid #d6d3d1", backgroundColor: "#fafaf9", padding: "4px 6px", borderRadius: "2px", marginBottom: "5px", display: "flex", gap: "6px", alignItems: "flex-start", minHeight: "22px" }}>
        <span style={{ fontWeight: 800, color: "#57534e", textTransform: "uppercase", fontSize: "7.5px", flexShrink: 0, paddingTop: "1px", lineHeight: "1.2" }}>
          Month(s) Paid:
        </span>
        <span style={{ fontWeight: 800, color: "#000000", fontSize: "9px", lineHeight: "1.25", wordBreak: "break-word", flex: 1 }}>
          {monthsText}
        </span>
      </div>

      {/* FINANCIAL SUMMARY TOTALS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", border: "1px solid #1c1917", padding: "3px", borderRadius: "2px", marginBottom: "5px", backgroundColor: "#fafaf9" }}>
        <div style={{ textAlign: "center", borderRight: "1px solid #d6d3d1" }}>
          <span style={{ fontSize: "7px", fontWeight: 800, textTransform: "uppercase", color: "#57534e", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Total Payable</span>
          <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 900, color: "#000000", display: "block", lineHeight: "1.2" }}>₹{totalPaid.toFixed(2)}</span>
        </div>
        <div style={{ textAlign: "center", borderRight: "1px solid #d6d3d1" }}>
          <span style={{ fontSize: "7px", fontWeight: 800, textTransform: "uppercase", color: "#57534e", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Amount Paid</span>
          <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 900, color: "#047857", display: "block", lineHeight: "1.2" }}>₹{totalPaid.toFixed(2)}</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: "7px", fontWeight: 800, textTransform: "uppercase", color: "#57534e", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Balance Dues</span>
          <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 900, color: "#000000", display: "block", lineHeight: "1.2" }}>₹{balance.toFixed(2)}</span>
        </div>
      </div>

      {/* AMOUNT IN WORDS & CASHIER SIGNATURE */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderTop: "1px solid #e7e5e4", paddingTop: "3px" }}>
        <div style={{ flex: 1, paddingRight: "5px" }}>
          <span style={{ fontWeight: 800, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.2", marginBottom: "1px" }}>Amount Received in Words</span>
          <span style={{ fontWeight: 700, fontStyle: "italic", color: "#000000", fontSize: "8.5px", lineHeight: "1.2", display: "block" }}>{wordsText}</span>
        </div>
        <div style={{ width: "90px", textAlign: "center", borderTop: "1px dashed #a8a29e", paddingTop: "2px", flexShrink: 0 }}>
          <span style={{ fontSize: "7.5px", fontWeight: 800, textTransform: "uppercase", color: "#44403c", display: "block", lineHeight: "1.2" }}>Cashier / In-Charge</span>
        </div>
      </div>
    </div>
  );
}

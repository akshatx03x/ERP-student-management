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

export function getReceiptFileName(data: FeeReceiptData, ext = ".pdf"): string {
  const firstAlloc = data.allocations?.[0];
  const studentName = firstAlloc?.studentName || (data as any).studentName || "Student";
  const admNo = firstAlloc?.admissionNo
    ? `_Adm_${String(firstAlloc.admissionNo).trim().replace(/[^a-zA-Z0-9_-]/g, "_")}`
    : "";
  const studentNameSlug = String(studentName).trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const receiptSlug = String(data.receiptNumber || data.receiptNo || "Receipt").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const dateStr = data.paidAt ? new Date(data.paidAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
  return `Fee_Receipt_${studentNameSlug}${admNo}_#${receiptSlug}_${dateStr}${ext}`;
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
  let monthsText = "All Session Months (April 2026 - March 2027)";
  if (monthsList.length >= 10) {
    monthsText = `${monthsList[0]} – ${monthsList[monthsList.length - 1]} (${monthsList.length} Months / Full Session)`;
  } else if (monthsList.length > 0) {
    monthsText = monthsList.join(", ");
  }

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
        fontSize: "9px",
        lineHeight: "1.2",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          borderBottom: "1.5px solid #1c1917",
          paddingBottom: "3px",
          marginBottom: "4.5px",
        }}
      >
        <table
          style={{
            width: "100%",
            tableLayout: "fixed",
            borderCollapse: "collapse",
            borderSpacing: 0,
          }}
        >
          <tbody>
            <tr>
              <td style={{ width: "27%", verticalAlign: "middle", textAlign: "left", padding: "0" }}>
                <span
                  style={{
                    display: "inline-block",
                    backgroundColor: "#1c1917",
                    color: "#ffffff",
                    fontWeight: 800,
                    padding: "2px 5px",
                    fontSize: "7.5px",
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    borderRadius: "2px",
                    lineHeight: "1",
                  }}
                >
                  {copyType}
                </span>
              </td>
              <td style={{ width: "46%", verticalAlign: "middle", textAlign: "center", padding: "0 2px" }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    color: "#000000",
                    lineHeight: "1.15",
                    fontFamily: '"Times New Roman", Times, serif',
                  }}
                >
                  {data.branding?.schoolName?.toUpperCase() || "VIDYANJALI"}
                </div>
                <div style={{ fontSize: "8.5px", fontWeight: 700, fontStyle: "italic", color: "#1c1917", letterSpacing: "0.3px", marginTop: "1px", lineHeight: "1.15" }}> 
                </div>
              </td>
              <td style={{ width: "27%", verticalAlign: "middle", textAlign: "right", padding: "0" }}>
                <span
                  style={{
                    display: "inline-block",
                    border: "1px solid #1c1917",
                    fontWeight: 700,
                    padding: "1.5px 5px",
                    fontSize: "7.5px",
                    textTransform: "uppercase",
                    backgroundColor: "#f5f5f4",
                    color: "#000000",
                    borderRadius: "2px",
                    lineHeight: "1",
                  }}
                >
                  FEE RECEIPT
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── METADATA TABLE (2-Column clean layout) ─────────────────────────── */}
      <table
        style={{
          width: "100%",
          tableLayout: "fixed",
          borderCollapse: "collapse",
          border: "1px solid #d6d3d1",
          backgroundColor: "#fafaf9",
          borderRadius: "2px",
          marginBottom: "4.5px",
        }}
      >
        <tbody>
          <tr>
            <td style={{ width: "50%", padding: "2.5px 5px", verticalAlign: "top" }}>
              <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Receipt No</span>
              <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#000000", fontSize: "10.5px", display: "block", lineHeight: "1.1" }}>#{receiptDisplayNo}</span>
            </td>
            <td style={{ width: "50%", padding: "2.5px 5px", textAlign: "right", verticalAlign: "top" }}>
              <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Date</span>
              <span style={{ fontWeight: 700, color: "#000000", fontSize: "8.5px", display: "block", lineHeight: "1.1" }}>{dateStr}</span>
            </td>
          </tr>
          <tr>
            <td style={{ width: "50%", padding: "2.5px 5px", borderTop: "1px solid #e7e5e4", verticalAlign: "top" }}>
              <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Student Name</span>
              <span style={{ fontWeight: 800, color: "#000000", textTransform: "uppercase", fontSize: "9px", wordBreak: "break-word", display: "block", lineHeight: "1.15" }}>{studentName}</span>
            </td>
            <td style={{ width: "50%", padding: "2.5px 5px", borderTop: "1px solid #e7e5e4", textAlign: "right", verticalAlign: "top" }}>
              <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Class & Sec</span>
              <span style={{ fontWeight: 700, color: "#000000", textTransform: "uppercase", fontSize: "8.5px", display: "block", lineHeight: "1.1" }}>{className}</span>
            </td>
          </tr>
          <tr>
            <td style={{ width: "50%", padding: "2.5px 5px", borderTop: "1px solid #e7e5e4", verticalAlign: "top" }}>
              <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Father's Name</span>
              <span style={{ fontWeight: 700, color: "#000000", textTransform: "uppercase", fontSize: "8.5px", wordBreak: "break-word", display: "block", lineHeight: "1.15" }}>{fatherName}</span>
            </td>
            <td style={{ width: "50%", padding: "2.5px 5px", borderTop: "1px solid #e7e5e4", textAlign: "right", verticalAlign: "top" }}>
              <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Admission No</span>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#000000", fontSize: "8.5px", display: "block", lineHeight: "1.1" }}>{admissionNo}</span>
            </td>
          </tr>
          <tr>
            <td style={{ width: "50%", padding: "2.5px 5px", borderTop: "1px solid #e7e5e4", verticalAlign: "top" }}>
              <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Payment Mode</span>
              <span style={{ fontWeight: 700, color: "#000000", textTransform: "uppercase", fontSize: "8px", display: "block", lineHeight: "1.1" }}>{data.method || "CASH"} {data.referenceNo ? `(${data.referenceNo})` : ""}</span>
            </td>
            <td style={{ width: "50%", padding: "2.5px 5px", borderTop: "1px solid #e7e5e4", textAlign: "right", verticalAlign: "top" }}>
              <span style={{ fontWeight: 700, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Session</span>
              <span style={{ fontWeight: 700, color: "#000000", fontSize: "8.5px", display: "block", lineHeight: "1.1" }}>2026-2027</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── FEE PARTICULAR TABLE ────────────────────────────────────────────── */}
      <table
        style={{
          width: "100%",
          tableLayout: "fixed",
          borderCollapse: "collapse",
          border: "1px solid #1c1917",
          marginBottom: "4.5px",
          fontSize: "8.5px",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#e7e5e4", fontSize: "7.5px", fontWeight: 900, textTransform: "uppercase", color: "#1c1917" }}>
            <th style={{ padding: "3px 4px", borderRight: "1px solid #1c1917", borderBottom: "1px solid #1c1917", width: "22px", textAlign: "center", lineHeight: "1.2" }}>S.N.</th>
            <th style={{ padding: "3px 5px", borderRight: "1px solid #1c1917", borderBottom: "1px solid #1c1917", textAlign: "left", lineHeight: "1.2" }}>Particulars / Fee Head</th>
            <th style={{ padding: "3px 5px", borderBottom: "1px solid #1c1917", textAlign: "right", width: "65px", lineHeight: "1.2" }}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {aggregatedRows.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ padding: "4px", textAlign: "center", color: "#78716c", lineHeight: "1.2", borderBottom: "1px solid #1c1917" }}>No fee heads specified</td>
            </tr>
          ) : (
            aggregatedRows.map((row, idx) => (
              <tr key={idx}>
                <td style={{ padding: "2.5px 4px", borderRight: "1px solid #e7e5e4", borderBottom: "1px solid #e7e5e4", textAlign: "center", fontWeight: 700, color: "#57534e", lineHeight: "1.2" }}>{idx + 1}</td>
                <td style={{ padding: "2.5px 5px", borderRight: "1px solid #e7e5e4", borderBottom: "1px solid #e7e5e4", fontWeight: 700, color: "#1c1917", textTransform: "uppercase", wordBreak: "break-word", lineHeight: "1.2" }}>{row.feeHead}</td>
                <td style={{ padding: "2.5px 5px", borderBottom: "1px solid #e7e5e4", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#000000", lineHeight: "1.2" }}>{row.amount.toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: "#f5f5f4", fontWeight: 800, fontSize: "8.5px" }}>
            <td colSpan={2} style={{ padding: "3px 5px", textAlign: "right", textTransform: "uppercase", borderTop: "1.5px solid #1c1917", borderRight: "1px solid #1c1917", lineHeight: "1.2" }}>Total Particulars:</td>
            <td style={{ padding: "3px 5px", textAlign: "right", fontFamily: "monospace", fontWeight: 900, color: "#000000", borderTop: "1.5px solid #1c1917", lineHeight: "1.2" }}>{totalTableFee.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      {/* ── MONTHS COVERED SECTION (Block layout, zero overlap) ───────────── */}
      <div
        style={{
          border: "1px solid #d6d3d1",
          backgroundColor: "#fafaf9",
          padding: "3px 5px",
          borderRadius: "2px",
          marginBottom: "4.5px",
          lineHeight: "1.2",
        }}
      >
        <span
          style={{
            fontWeight: 800,
            color: "#57534e",
            textTransform: "uppercase",
            fontSize: "7px",
            marginRight: "4px",
            display: "inline",
          }}
        >
          Month(s) Paid:
        </span>
        <span
          style={{
            fontWeight: 800,
            color: "#000000",
            fontSize: "8px",
            wordBreak: "break-word",
            display: "inline",
          }}
        >
          {monthsText}
        </span>
      </div>

      {/* ── FINANCIAL SUMMARY TOTALS ────────────────────────────────────────── */}
      <table
        style={{
          width: "100%",
          tableLayout: "fixed",
          borderCollapse: "collapse",
          border: "1px solid #1c1917",
          backgroundColor: "#fafaf9",
          marginBottom: "4.5px",
        }}
      >
        <tbody>
          <tr>
            <td style={{ textAlign: "center", padding: "3px 2px", borderRight: "1px solid #d6d3d1", width: "33.33%" }}>
              <span style={{ fontSize: "6.5px", fontWeight: 800, textTransform: "uppercase", color: "#57534e", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Total Payable</span>
              <span style={{ fontFamily: "monospace", fontSize: "9.5px", fontWeight: 900, color: "#000000", display: "block", lineHeight: "1.1" }}>₹{totalPaid.toFixed(2)}</span>
            </td>
            <td style={{ textAlign: "center", padding: "3px 2px", borderRight: "1px solid #d6d3d1", width: "33.33%" }}>
              <span style={{ fontSize: "6.5px", fontWeight: 800, textTransform: "uppercase", color: "#57534e", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Amount Paid</span>
              <span style={{ fontFamily: "monospace", fontSize: "9.5px", fontWeight: 900, color: "#047857", display: "block", lineHeight: "1.1" }}>₹{totalPaid.toFixed(2)}</span>
            </td>
            <td style={{ textAlign: "center", padding: "3px 2px", width: "33.33%" }}>
              <span style={{ fontSize: "6.5px", fontWeight: 800, textTransform: "uppercase", color: "#57534e", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Balance Dues</span>
              <span style={{ fontFamily: "monospace", fontSize: "9.5px", fontWeight: 900, color: "#000000", display: "block", lineHeight: "1.1" }}>₹{balance.toFixed(2)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── AMOUNT IN WORDS & CASHIER SIGNATURE ────────────────────────────── */}
      <table
        style={{
          width: "100%",
          tableLayout: "fixed",
          borderCollapse: "separate",
          borderSpacing: 0,
          borderTop: "1px solid #e7e5e4",
          paddingTop: "4px",
        }}
      >
        <tbody>
          <tr>
            <td style={{ verticalAlign: "bottom", paddingRight: "6px" }}>
              <span style={{ fontWeight: 800, color: "#57534e", textTransform: "uppercase", fontSize: "7px", display: "block", lineHeight: "1.1", marginBottom: "1px" }}>Amount Received in Words</span>
              <span style={{ fontWeight: 700, fontStyle: "italic", color: "#000000", fontSize: "8px", lineHeight: "1.25", display: "block", wordBreak: "break-word" }}>{wordsText}</span>
            </td>
            <td style={{ width: "88px", verticalAlign: "bottom", textAlign: "center" }}>
              <div style={{ borderTop: "1px dashed #a8a29e", paddingTop: "2px" }}>
                <span style={{ fontSize: "7px", fontWeight: 800, textTransform: "uppercase", color: "#44403c", display: "block", lineHeight: "1.1" }}>Cashier / In-Charge</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

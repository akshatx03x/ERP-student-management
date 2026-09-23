"use client";

import React from "react";
import ReactDOM from "react-dom/client";
import { SingleFeeReceipt, FeeReceiptData } from "./fee-receipt-single";

/**
 * Creates or retrieves an isolated iframe configured specifically for print preview.
 * Chromium requires the iframe to be attached to the DOM and have layout dimensions
 * (not display:none, not visibility:hidden, not 0x0 size) with opacity:0.
 */
function getPrintIframe(id = "erp-isolated-print-iframe"): HTMLIFrameElement {
  let iframe = document.getElementById(id) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = id;
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "210mm";
    iframe.style.height = "297mm";
    iframe.style.border = "none";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-9999";
    document.body.appendChild(iframe);
  }
  return iframe;
}

/**
 * Prints a single fee receipt side-by-side (SCHOOL COPY on Left, PARENT COPY on Right)
 * in an isolated iframe. Guaranteed to print ONLY the receipt with ZERO background page content.
 */
export async function printReceipt(data: FeeReceiptData): Promise<void> {
  const iframe = getPrintIframe("erp-single-receipt-iframe");
  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    window.print();
    return;
  }

  // Collect active font/style sheets to preserve styling inside iframe
  const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
    .map((el) => el.outerHTML)
    .join("\n");

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Fee Receipt #${data.receiptNumber || data.receiptNo || ""}</title>
        ${styles}
        <style>
          @page {
            size: A4 portrait !important;
            margin: 6mm 5mm !important;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            width: 100% !important;
            line-height: normal !important;
          }
          .receipt-print-canvas {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: stretch !important;
            width: 100% !important;
            max-width: 195mm !important;
            margin: 0 auto !important;
            background: #ffffff !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div id="receipt-print-mount"></div>
      </body>
    </html>
  `);
  doc.close();

  const mountPoint = doc.getElementById("receipt-print-mount");
  if (!mountPoint) {
    iframe.contentWindow?.print();
    return;
  }

  const root = ReactDOM.createRoot(mountPoint);
  root.render(
    <div className="receipt-print-canvas">
      {/* SCHOOL COPY (LEFT) */}
      <SingleFeeReceipt data={data} copyType="SCHOOL COPY" isSideBySide={true} />

      {/* CUT LINE DIVIDER (CENTER) */}
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
            ✂ CUT HERE ✂
          </span>
        </div>
      </div>

      {/* PARENT COPY (RIGHT) */}
      <SingleFeeReceipt data={data} copyType="PARENT COPY" isSideBySide={true} />
    </div>
  );

  // Wait for React to finish rendering before triggering print
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 250);
}

/**
 * Prints multiple fee receipts side-by-side in an isolated iframe.
 * Each receipt is separated by a page break.
 */
export async function printBulkReceipts(receipts: FeeReceiptData[]): Promise<void> {
  if (!receipts || receipts.length === 0) return;

  const iframe = getPrintIframe("erp-bulk-receipt-iframe");
  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    window.print();
    return;
  }

  const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
    .map((el) => el.outerHTML)
    .join("\n");

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Bulk Fee Receipts (${receipts.length})</title>
        ${styles}
        <style>
          @page {
            size: A4 portrait !important;
            margin: 6mm 5mm !important;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            width: 100% !important;
            line-height: normal !important;
          }
          .bulk-receipt-unit {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: stretch !important;
            width: 100% !important;
            max-width: 195mm !important;
            margin: 0 auto 6mm auto !important;
            background: #ffffff !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .bulk-receipt-unit:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
            margin-bottom: 0 !important;
          }
          .no-print {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div id="bulk-receipt-print-mount"></div>
      </body>
    </html>
  `);
  doc.close();

  const mountPoint = doc.getElementById("bulk-receipt-print-mount");
  if (!mountPoint) {
    iframe.contentWindow?.print();
    return;
  }

  const root = ReactDOM.createRoot(mountPoint);
  root.render(
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {receipts.map((r, idx) => (
        <div key={idx} className="bulk-receipt-unit">
          <SingleFeeReceipt data={r} copyType="SCHOOL COPY" isSideBySide={true} />
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
                ✂ CUT HERE ✂
              </span>
            </div>
          </div>
          <SingleFeeReceipt data={r} copyType="PARENT COPY" isSideBySide={true} />
        </div>
      ))}
    </div>
  );

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 350);
}

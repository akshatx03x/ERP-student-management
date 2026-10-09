"use client";

import React from "react";
import ReactDOM from "react-dom/client";
import { SingleFeeReceipt, FeeReceiptData, getReceiptFileName } from "./fee-receipt-single";

/**
 * Creates or retrieves an isolated iframe configured specifically for print preview.
 * Chromium requires layout dimensions (not display:none, not visibility:hidden, not 0x0 size)
 * and an opacity > 0 to guarantee proper rasterization for print.
 */
function getPrintIframe(id = "erp-isolated-print-iframe"): HTMLIFrameElement {
  let iframe = document.getElementById(id) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = id;
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "210mm";
    iframe.style.height = "297mm";
    iframe.style.border = "none";
    iframe.style.opacity = "0.01";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);
  }
  return iframe;
}

/**
 * Prints a single fee receipt side-by-side (SCHOOL COPY on Left, PARENT COPY on Right)
 * in an isolated iframe. Automatically presets the PDF filename for the system print dialog.
 */
export async function printReceipt(data: FeeReceiptData): Promise<void> {
  const iframe = getPrintIframe("erp-single-receipt-iframe");
  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    window.print();
    return;
  }

  const fileNameWithoutExt = getReceiptFileName(data, "");
  const prevTitle = document.title;
  // Setting document.title sets the default name when user clicks "Save as PDF" in Chrome / Edge
  document.title = fileNameWithoutExt;

  // Collect active font/style sheets to preserve styling inside iframe,
  // excluding any destructive parent print rules that hide body elements
  const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
    .map((el) => {
      const html = el.outerHTML;
      return html.replace(/body\s*\*\s*\{\s*visibility\s*:\s*hidden\s*!important\s*;?\s*\}/gi, "");
    })
    .join("\n");

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${fileNameWithoutExt}</title>
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
            visibility: visible !important;
          }
          body * {
            visibility: visible !important;
          }
          #receipt-print-mount,
          .fee-receipt-print-wrapper,
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
            visibility: visible !important;
          }
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
          @media print {
            body {
              visibility: visible !important;
              background: #ffffff !important;
            }
            body * {
              visibility: visible !important;
            }
          }
        </style>
      </head>
      <body>
        <div id="receipt-print-mount" class="fee-receipt-print-wrapper"></div>
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
            - - CUT HERE - -
          </span>
        </div>
      </div>

      {/* PARENT COPY (RIGHT) */}
      <SingleFeeReceipt data={data} copyType="PARENT COPY" isSideBySide={true} />
    </div>
  );

  const cleanup = () => {
    document.title = prevTitle;
  };
  iframe.contentWindow?.addEventListener("afterprint", cleanup, { once: true });

  // Wait for React to finish rendering before triggering print
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Safety fallback to restore title if afterprint doesn't fire
    setTimeout(cleanup, 4000);
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

  const dateStr = new Date().toISOString().split("T")[0];
  const bulkTitle = `Bulk_Fee_Receipts_${receipts.length}_${dateStr}`;
  const prevTitle = document.title;
  document.title = bulkTitle;

  const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
    .map((el) => {
      const html = el.outerHTML;
      return html.replace(/body\s*\*\s*\{\s*visibility\s*:\s*hidden\s*!important\s*;?\s*\}/gi, "");
    })
    .join("\n");

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${bulkTitle}</title>
        ${styles}
        <style>
          @page {
            size: A4 portrait !important;
            margin: 4mm 5mm !important;
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
            visibility: visible !important;
          }
          body * {
            visibility: visible !important;
          }
          .bulk-print-page {
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            align-items: stretch !important;
            width: 100% !important;
            max-width: 195mm !important;
            margin: 0 auto !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            visibility: visible !important;
          }
          .bulk-print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .bulk-receipt-unit {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: stretch !important;
            width: 100% !important;
            margin: 0 auto !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            visibility: visible !important;
          }
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
          @media print {
            body {
              visibility: visible !important;
              background: #ffffff !important;
            }
            body * {
              visibility: visible !important;
            }
          }
        </style>
      </head>
      <body>
        <div id="bulk-receipt-print-mount" class="fee-receipt-print-wrapper"></div>
      </body>
    </html>
  `);
  doc.close();

  const mountPoint = doc.getElementById("bulk-receipt-print-mount");
  if (!mountPoint) {
    iframe.contentWindow?.print();
    return;
  }

  // Chunk receipts by 3 per physical sheet
  const pageSize = 3;
  const chunkedPages: FeeReceiptData[][] = [];
  for (let i = 0; i < receipts.length; i += pageSize) {
    chunkedPages.push(receipts.slice(i, i + pageSize));
  }

  const root = ReactDOM.createRoot(mountPoint);
  root.render(
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {chunkedPages.map((pageReceipts, pageIdx) => (
        <div key={pageIdx} className="bulk-print-page" style={{ gap: "2mm" }}>
          {pageReceipts.map((r, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <div style={{ borderTop: "1.5px dashed #a8a29e", width: "100%", margin: "0.5mm 0" }} />
              )}
              <div className="bulk-receipt-unit">
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
                      - - CUT HERE - -
                    </span>
                  </div>
                </div>
                <SingleFeeReceipt data={r} copyType="PARENT COPY" isSideBySide={true} />
              </div>
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );

  const cleanup = () => {
    document.title = prevTitle;
  };
  iframe.contentWindow?.addEventListener("afterprint", cleanup, { once: true });

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(cleanup, 4000);
  }, 350);
}

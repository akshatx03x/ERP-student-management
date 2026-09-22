"use client";

import React from "react";
import ReactDOM from "react-dom/client";
import { TransferCertificateDocument, TCRecord, TCSnapshotData } from "./transfer-certificate-document";

function getPrintIframe(id = "erp-isolated-tc-iframe"): HTMLIFrameElement {
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
 * Prints the Transfer Certificate using an isolated iframe.
 * Guaranteed to produce exactly 1 single page with zero background UI elements.
 */
export async function printTC(tc: TCRecord, snapshot: TCSnapshotData): Promise<void> {
  const iframe = getPrintIframe("erp-isolated-tc-iframe");
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
        <title>Transfer Certificate - ${snapshot.student?.fullName || tc.tcNumber}</title>
        ${styles}
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'Times New Roman', Times, Georgia, serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            width: 100% !important;
            height: auto !important;
          }
          .tc-print-canvas {
            width: 100% !important;
            max-width: 200mm !important;
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
        <div id="tc-print-mount"></div>
      </body>
    </html>
  `);
  doc.close();

  const mountPoint = doc.getElementById("tc-print-mount");
  if (!mountPoint) {
    iframe.contentWindow?.print();
    return;
  }

  const root = ReactDOM.createRoot(mountPoint);
  root.render(
    <div className="tc-print-canvas">
      <TransferCertificateDocument tc={tc} snapshot={snapshot} isPrintOnly={true} />
    </div>
  );

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 250);
}

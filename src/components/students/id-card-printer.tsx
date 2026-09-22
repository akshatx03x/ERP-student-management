"use client";

import React from "react";
import ReactDOM from "react-dom/client";
import { IDCard, StudentProps, BrandingProps } from "./id-card";
import { jsPDF } from "jspdf";

const CARD_WIDTH_MM = 52;  // 5.2 cm
const CARD_HEIGHT_MM = 84; // 8.4 cm

function getPrintIframe(id = "erp-isolated-id-card-iframe"): HTMLIFrameElement {
  let iframe = document.getElementById(id) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = id;
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "297mm";
    iframe.style.height = "210mm";
    iframe.style.border = "none";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-9999";
    document.body.appendChild(iframe);
  }
  return iframe;
}

/**
 * Prints a single ID card using an isolated iframe.
 * Preserves the exact 52mm x 84mm (5.2cm x 8.4cm) dimensions.
 */
export async function printSingleIDCard(
  student: StudentProps,
  branding: BrandingProps | null,
  selectedSessionId: string
): Promise<void> {
  const iframe = getPrintIframe("erp-isolated-id-card-iframe");
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
        <title>ID Card - ${student.fullName}</title>
        ${styles}
        <style>
          @page {
            size: auto;
            margin: 5mm;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: Arial, Helvetica, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            display: flex !important;
            justify-content: center !important;
            align-items: flex-start !important;
            padding-top: 5mm !important;
          }
          .id-card-single-canvas {
            width: ${CARD_WIDTH_MM}mm !important;
            height: ${CARD_HEIGHT_MM}mm !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div id="id-card-mount" class="id-card-single-canvas"></div>
      </body>
    </html>
  `);
  doc.close();

  const mountPoint = doc.getElementById("id-card-mount");
  if (!mountPoint) {
    iframe.contentWindow?.print();
    return;
  }

  const root = ReactDOM.createRoot(mountPoint);
  root.render(
    <IDCard
      student={student}
      branding={branding}
      selectedSessionId={selectedSessionId}
      zoom={1}
      cardWidth={CARD_WIDTH_MM}
      cardHeight={CARD_HEIGHT_MM}
    />
  );

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 250);
}

/**
 * Prints bulk ID cards arranged in LANDSCAPE on A4 paper with exactly 10 cards per page.
 * (5 columns x 2 rows = 10 cards, width: 5.2cm, length/height: 8.4cm).
 */
export async function printBulkIDCards(
  students: StudentProps[],
  branding: BrandingProps | null,
  selectedSessionId: string
): Promise<void> {
  const iframe = getPrintIframe("erp-isolated-bulk-id-card-iframe");
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
        <title>Bulk ID Cards Print (${students.length} Students)</title>
        ${styles}
        <style>
          @page {
            size: A4 landscape;
            margin: 12mm 10mm;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: Arial, Helvetica, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .bulk-landscape-page {
            width: 277mm !important;
            height: 186mm !important;
            display: grid !important;
            grid-template-columns: repeat(5, ${CARD_WIDTH_MM}mm) !important;
            grid-template-rows: repeat(2, ${CARD_HEIGHT_MM}mm) !important;
            gap: 4mm 3.5mm !important;
            justify-content: center !important;
            align-content: center !important;
            margin: 0 auto !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .bulk-landscape-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .bulk-card-item {
            width: ${CARD_WIDTH_MM}mm !important;
            height: ${CARD_HEIGHT_MM}mm !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div id="bulk-id-card-mount"></div>
      </body>
    </html>
  `);
  doc.close();

  const mountPoint = doc.getElementById("bulk-id-card-mount");
  if (!mountPoint) {
    iframe.contentWindow?.print();
    return;
  }

  // Chunk students into pages of 10 cards each
  const pageSize = 10;
  const pages: StudentProps[][] = [];
  for (let i = 0; i < students.length; i += pageSize) {
    pages.push(students.slice(i, i + pageSize));
  }

  const root = ReactDOM.createRoot(mountPoint);
  root.render(
    <>
      {pages.map((pageStudents, pageIdx) => (
        <div key={pageIdx} className="bulk-landscape-page">
          {pageStudents.map((st) => (
            <div key={st.id} className="bulk-card-item">
              <IDCard
                student={st}
                branding={branding}
                selectedSessionId={selectedSessionId}
                zoom={1}
                cardWidth={CARD_WIDTH_MM}
                cardHeight={CARD_HEIGHT_MM}
              />
            </div>
          ))}
        </div>
      ))}
    </>
  );

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 350);
}

/**
 * Downloads a single ID card as a high-resolution 52mm x 84mm PDF using html2canvas.
 */
export async function downloadSingleIDCardPDF(
  student: StudentProps,
  branding: BrandingProps | null,
  selectedSessionId: string
): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = `${CARD_WIDTH_MM}mm`;
  container.style.height = `${CARD_HEIGHT_MM}mm`;
  container.style.background = "#ffffff";
  container.style.zIndex = "-9999";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);

  const root = ReactDOM.createRoot(container);

  try {
    await new Promise<void>((resolve) => {
      root.render(
        <IDCard
          student={student}
          branding={branding}
          selectedSessionId={selectedSessionId}
          zoom={1}
          cardWidth={CARD_WIDTH_MM}
          cardHeight={CARD_HEIGHT_MM}
        />
      );
      setTimeout(resolve, 150);
    });

    const cardEl = (container.firstElementChild as HTMLElement) || container;
    const canvas = await html2canvas(cardEl, {
      scale: 4, // 4x supersampling for ultra-crisp physical print quality
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [CARD_WIDTH_MM, CARD_HEIGHT_MM],
    });

    pdf.addImage(imgData, "PNG", 0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM, undefined, "NONE");
    const cleanName = student.fullName.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    pdf.save(`ID-Card-${cleanName}.pdf`);
  } finally {
    root.unmount();
    container.remove();
  }
}

/**
 * Downloads bulk ID cards in LANDSCAPE A4 PDF with exactly 10 cards per page.
 * (5 columns x 2 rows, 5.2cm x 8.4cm per card).
 */
export async function downloadBulkIDCardsPDF(
  students: StudentProps[],
  branding: BrandingProps | null,
  selectedSessionId: string,
  filename = "Bulk-Student-ID-Cards.pdf",
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (students.length === 0) return;

  const html2canvas = (await import("html2canvas")).default;

  // A4 Landscape: 297mm width x 210mm height
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = `${CARD_WIDTH_MM}mm`;
  container.style.height = `${CARD_HEIGHT_MM}mm`;
  container.style.background = "#ffffff";
  container.style.zIndex = "-9999";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);

  const root = ReactDOM.createRoot(container);

  // 10 cards per page (5 columns x 2 rows)
  const cardsPerPage = 10;
  const xMargin = 11.5; // (297 - (5*52 + 4*3.5)) / 2 = 11.5mm
  const yMargin = 19;   // (210 - (2*84 + 1*4)) / 2 = 19mm
  const xGap = 3.5;
  const yGap = 4;

  try {
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const posOnPage = i % cardsPerPage;

      if (i > 0 && posOnPage === 0) {
        pdf.addPage("a4", "landscape");
      }

      const col = posOnPage % 5;
      const row = Math.floor(posOnPage / 5);

      const xPos = xMargin + col * (CARD_WIDTH_MM + xGap);
      const yPos = yMargin + row * (CARD_HEIGHT_MM + yGap);

      await new Promise<void>((resolve) => {
        root.render(
          <IDCard
            student={student}
            branding={branding}
            selectedSessionId={selectedSessionId}
            zoom={1}
            cardWidth={CARD_WIDTH_MM}
            cardHeight={CARD_HEIGHT_MM}
          />
        );
        setTimeout(resolve, 120);
      });

      const cardEl = (container.firstElementChild as HTMLElement) || container;
      const canvas = await html2canvas(cardEl, {
        scale: 4, // 4x supersampling
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", xPos, yPos, CARD_WIDTH_MM, CARD_HEIGHT_MM, undefined, "NONE");

      if (onProgress) {
        onProgress(i + 1, students.length);
      }
    }

    pdf.save(filename);
  } finally {
    root.unmount();
    container.remove();
  }
}

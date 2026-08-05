"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IDCard } from "./id-card";
import { jsPDF } from "jspdf";
import { Loader2, X } from "lucide-react";

interface StudentProps {
  id: string;
  fullName: string;
  admissionNo: string;
  dateOfBirth: string | Date | null;
  photoUrl: string | null;
  family: {
    fatherName: string | null;
    motherName: string | null;
    primaryPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  } | null;
  enrollments: Array<{
    rollNo: string | null;
    class: { name: string };
    section: { name: string };
    session: { id: string; name: string };
    sessionId: string;
  }>;
}

interface BrandingProps {
  schoolName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoDocumentId: string | null;
  principalSignatureDocumentId: string | null;
}

interface IDCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentProps;
  branding: BrandingProps | null;
  selectedSessionId: string;
}

export function IDCardModal({ isOpen, onClose, student, branding, selectedSessionId }: IDCardModalProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
      .map((el) => el.outerHTML)
      .join("\n");

    const logoUrl = branding?.logoDocumentId ? `/api/documents/${branding.logoDocumentId}` : "";
    const signatureUrl = branding?.principalSignatureDocumentId
      ? `/api/documents/${branding.principalSignatureDocumentId}`
      : "";
    const photoUrl = student.photoUrl || "";

    const enrollment =
      student.enrollments.find((e) => e.sessionId === selectedSessionId) ||
      student.enrollments[0];
    const sessionName = enrollment?.session?.name || "Academic Session";
    const className = enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "—";
    const rollNo = enrollment?.rollNo || "—";

    const dob = student.dateOfBirth
      ? new Date(student.dateOfBirth).toLocaleDateString("en-US", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

    const addressParts = [];
    if (student.family?.addressLine1) addressParts.push(student.family.addressLine1);
    if (student.family?.addressLine2) addressParts.push(student.family.addressLine2);
    if (student.family?.city) addressParts.push(student.family.city);
    if (student.family?.pincode) addressParts.push(student.family.pincode);
    const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "—";

    printWindow.document.write(`
      <html>
        <head>
          <title>ID Card - ${student.fullName}</title>
          ${styles}
          <style>
            body {
              margin: 0;
              padding: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              background-color: white;
            }
            @media print {
              body {
                height: auto;
              }
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="relative flex flex-col bg-white border border-stone-300 text-stone-800 overflow-hidden text-left" style="width: 54mm; height: 86mm; border-radius: 4mm;">
            <!-- Watermark -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none z-0">
              <span class="text-[12px] font-extrabold uppercase rotate-45 text-center leading-tight max-w-[90%] break-words">
                ${branding?.schoolName || "ERP SCHOOL"}
              </span>
            </div>
            
            <!-- Header -->
            <div class="relative z-10 bg-slate-900 text-white flex flex-col justify-center px-2 py-1.5 border-b border-amber-500 h-[18mm] shrink-0 text-center">
              <div class="flex items-center gap-1.5 justify-center">
                ${
                  logoUrl
                    ? `<img src="${logoUrl}" alt="Logo" class="w-[8mm] h-[8mm] object-contain rounded-xs" />`
                    : `<div class="w-[8mm] h-[8mm] bg-amber-500 text-slate-900 rounded-xs flex items-center justify-center font-bold text-[10px]">${(branding?.schoolName || "S").charAt(0).toUpperCase()}</div>`
                }
                <div class="flex flex-col text-left overflow-hidden">
                  <h1 class="font-extrabold text-[8.5px] leading-tight uppercase truncate max-w-[36mm]">${branding?.schoolName || "ERP SCHOOL"}</h1>
                  <p class="text-[5.5px] leading-normal opacity-90 truncate max-w-[36mm]">${branding?.address || "School Campus Address"}</p>
                  <p class="text-[5px] leading-normal opacity-75 truncate max-w-[36mm]">${branding?.phone ? `Ph: ${branding.phone}` : ""}</p>
                </div>
              </div>
            </div>

            <!-- Body -->
            <div class="relative z-10 flex flex-col flex-1 p-2 bg-gradient-to-b from-stone-50 to-white text-[7px] leading-tight">
              <div class="flex gap-2 mb-2 items-start">
                <div class="w-[18mm] h-[22mm] bg-stone-100 border border-stone-300 rounded-[1mm] overflow-hidden shrink-0 flex items-center justify-center relative shadow-2xs">
                  ${
                    photoUrl
                      ? `<img src="${photoUrl}" alt="${student.fullName}" class="w-full h-full object-cover" />`
                      : `<div class="flex flex-col items-center justify-center text-stone-400 h-full w-full"><span class="text-[12px] font-bold">📷</span><span class="text-[5px] uppercase font-semibold mt-0.5">No Photo</span></div>`
                  }
                </div>
                <div class="flex flex-col flex-1 gap-1">
                  <span class="bg-amber-100 text-amber-800 font-bold px-1 py-0.5 rounded-xs inline-block text-[5.5px] max-w-fit uppercase border border-amber-200">${sessionName}</span>
                  <div>
                    <p class="text-stone-450 uppercase font-extrabold text-[5px]">Admission No</p>
                    <p class="font-mono font-bold text-stone-900 text-[8px]">${student.admissionNo}</p>
                  </div>
                  <div>
                    <p class="text-stone-450 uppercase font-extrabold text-[5px]">Class / Sec</p>
                    <p class="font-extrabold text-stone-900 text-[8px]">${className}</p>
                  </div>
                </div>
              </div>

              <div class="mb-1.5 border-b pb-0.5 border-stone-100">
                <p class="text-stone-450 uppercase font-extrabold text-[5px]">Student Name</p>
                <h2 class="font-black text-slate-900 text-[9.5px] uppercase leading-tight truncate">${student.fullName}</h2>
              </div>

              <div class="flex flex-col gap-1 flex-1 min-h-0 overflow-hidden">
                <div class="grid grid-cols-2 gap-x-2 gap-y-1">
                  <div>
                    <span class="text-stone-400 font-medium block">Father's Name</span>
                    <span class="font-semibold text-stone-800 truncate block max-w-full">${student.family?.fatherName || "—"}</span>
                  </div>
                  <div>
                    <span class="text-stone-400 font-medium block">Mother's Name</span>
                    <span class="font-semibold text-stone-800 truncate block max-w-full">${student.family?.motherName || "—"}</span>
                  </div>
                  <div>
                    <span class="text-stone-400 font-medium block">Date of Birth</span>
                    <span class="font-semibold text-stone-800 block">${dob}</span>
                  </div>
                  <div>
                    <span class="text-stone-400 font-medium block">Roll Number</span>
                    <span class="font-semibold text-stone-800 block">${rollNo}</span>
                  </div>
                </div>
                <div class="mt-1">
                  <span class="text-stone-450 font-medium block">Contact Number</span>
                  <span class="font-mono font-bold text-stone-800 block">${student.family?.primaryPhone || "—"}</span>
                </div>
                <div class="mt-1 leading-normal">
                  <span class="text-stone-450 font-medium block">Residential Address</span>
                  <span class="font-medium text-stone-700 block line-clamp-2 text-[6.5px]">${fullAddress}</span>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="relative z-10 bg-stone-50 border-t border-stone-200 px-2 py-1.5 h-[14mm] shrink-0 flex items-center justify-center text-[6px]">
              <div class="flex flex-col items-center justify-end h-full text-[5px] text-stone-500 font-semibold relative text-center min-w-[28mm]">
                ${
                  signatureUrl
                    ? `<img src="${signatureUrl}" alt="Signature" class="absolute bottom-[6px] max-h-[8mm] max-w-[28mm] object-contain select-none" />`
                    : `<div class="h-[8mm] w-full"></div>`
                }
                <span class="border-t border-stone-300 w-full pt-0.5 uppercase tracking-wide font-bold">Principal Signature</span>
              </div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
          img.src = src;
        });
      };

      const canvas = document.createElement("canvas");
      const scale = 12;
      canvas.width = 54 * scale;
      canvas.height = 86 * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, 18 * scale);

      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(0, 18 * scale - 1.5, canvas.width, 1.5);

      const logoUrl = branding?.logoDocumentId ? `/api/documents/${branding.logoDocumentId}` : null;
      let logoImg: HTMLImageElement | null = null;
      if (logoUrl) {
        try {
          logoImg = await loadImage(logoUrl);
        } catch (e) {
          console.warn("Failed to load school logo for PDF rendering", e);
        }
      }

      const sigUrl = branding?.principalSignatureDocumentId
        ? `/api/documents/${branding.principalSignatureDocumentId}`
        : null;

      if (logoImg) {
        ctx.drawImage(logoImg, 3 * scale, 3 * scale, 12 * scale, 12 * scale);
      } else {
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(3 * scale, 3 * scale, 12 * scale, 12 * scale);
        ctx.fillStyle = "#0f172a";
        ctx.font = `bold ${8 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          (branding?.schoolName || "S").charAt(0).toUpperCase(),
          9 * scale,
          9 * scale
        );
      }

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${3.8 * scale}px sans-serif`;
      ctx.fillText(
        (branding?.schoolName || "ERP SCHOOL").toUpperCase(),
        17 * scale,
        6.5 * scale,
        34 * scale
      );

      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = `${2.3 * scale}px sans-serif`;
      ctx.fillText(branding?.address || "School Campus Address", 17 * scale, 10.5 * scale, 34 * scale);

      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.font = `${2.1 * scale}px sans-serif`;
      ctx.fillText(
        branding?.phone ? `Ph: ${branding.phone}` : "",
        17 * scale,
        14 * scale,
        34 * scale
      );

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((45 * Math.PI) / 180);
      ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
      ctx.font = `bold ${4.5 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText((branding?.schoolName || "ERP SCHOOL").toUpperCase(), 0, 0, 48 * scale);
      ctx.restore();

      let photoImg: HTMLImageElement | null = null;
      if (student.photoUrl) {
        try {
          photoImg = await loadImage(student.photoUrl);
        } catch (e) {
          console.warn("Failed to load student photo for PDF rendering", e);
        }
      }

      const photoX = 4 * scale;
      const photoY = 22 * scale;
      const photoW = 18 * scale;
      const photoH = 22 * scale;

      ctx.strokeStyle = "#d6d3d1";
      ctx.lineWidth = 1;
      ctx.strokeRect(photoX, photoY, photoW, photoH);

      if (photoImg) {
        ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
      } else {
        ctx.fillStyle = "#f5f5f4";
        ctx.fillRect(photoX, photoY, photoW, photoH);
        ctx.fillStyle = "#a8a29e";
        ctx.font = `${3 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📷", photoX + photoW / 2, photoY + photoH / 2 - 2 * scale);
        ctx.font = `bold ${1.6 * scale}px sans-serif`;
        ctx.fillText("NO PHOTO", photoX + photoW / 2, photoY + photoH / 2 + 3 * scale);
      }

      const enrollment =
        student.enrollments.find((e) => e.sessionId === selectedSessionId) ||
        student.enrollments[0];
      const sessionName = enrollment?.session?.name || "Academic Session";
      const className = enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "—";
      const rollNo = enrollment?.rollNo || "—";

      const badgeX = 25 * scale;
      const badgeY = 22 * scale;
      const badgeW = 25 * scale;
      const badgeH = 4 * scale;
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.strokeStyle = "#fde68a";
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

      ctx.fillStyle = "#92400e";
      ctx.font = `bold ${2.2 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(sessionName.toUpperCase(), badgeX + badgeW / 2, badgeY + badgeH / 2);

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      ctx.fillStyle = "#78716c";
      ctx.font = `bold ${1.8 * scale}px sans-serif`;
      ctx.fillText("ADMISSION NO", 25 * scale, 31 * scale);
      ctx.fillStyle = "#1c1917";
      ctx.font = `bold ${2.8 * scale}px sans-serif`;
      ctx.fillText(student.admissionNo, 25 * scale, 34.5 * scale);

      ctx.fillStyle = "#78716c";
      ctx.font = `bold ${1.8 * scale}px sans-serif`;
      ctx.fillText("CLASS / SEC", 25 * scale, 39.5 * scale);
      ctx.fillStyle = "#1c1917";
      ctx.font = `bold ${2.8 * scale}px sans-serif`;
      ctx.fillText(className, 25 * scale, 43 * scale);

      ctx.fillStyle = "#78716c";
      ctx.font = `bold ${1.8 * scale}px sans-serif`;
      ctx.fillText("STUDENT NAME", 4 * scale, 49 * scale);
      ctx.fillStyle = "#0f172a";
      ctx.font = `bold ${3.4 * scale}px sans-serif`;
      ctx.fillText(student.fullName.toUpperCase(), 4 * scale, 53 * scale, 46 * scale);

      ctx.strokeStyle = "#f5f5f4";
      ctx.beginPath();
      ctx.moveTo(4 * scale, 55 * scale);
      ctx.lineTo(50 * scale, 55 * scale);
      ctx.stroke();

      const gridY = 59 * scale;
      const rowGap = 4.2 * scale;

      ctx.fillStyle = "#78716c";
      ctx.font = `${1.8 * scale}px sans-serif`;
      ctx.fillText("Father's Name", 4 * scale, gridY);
      ctx.fillStyle = "#1c1917";
      ctx.font = `bold ${2.1 * scale}px sans-serif`;
      ctx.fillText(student.family?.fatherName || "—", 4 * scale, gridY + 2.4 * scale, 22 * scale);

      ctx.fillStyle = "#78716c";
      ctx.font = `${1.8 * scale}px sans-serif`;
      ctx.fillText("Mother's Name", 27 * scale, gridY);
      ctx.fillStyle = "#1c1917";
      ctx.font = `bold ${2.1 * scale}px sans-serif`;
      ctx.fillText(student.family?.motherName || "—", 27 * scale, gridY + 2.4 * scale, 22 * scale);

      const dobStr = student.dateOfBirth
        ? new Date(student.dateOfBirth).toLocaleDateString("en-US", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—";
      ctx.fillStyle = "#78716c";
      ctx.font = `${1.8 * scale}px sans-serif`;
      ctx.fillText("Date of Birth", 4 * scale, gridY + rowGap);
      ctx.fillStyle = "#1c1917";
      ctx.font = `bold ${2.1 * scale}px sans-serif`;
      ctx.fillText(dobStr, 4 * scale, gridY + rowGap + 2.4 * scale);

      ctx.fillStyle = "#78716c";
      ctx.font = `${1.8 * scale}px sans-serif`;
      ctx.fillText("Roll Number", 27 * scale, gridY + rowGap);
      ctx.fillStyle = "#1c1917";
      ctx.font = `bold ${2.1 * scale}px sans-serif`;
      ctx.fillText(rollNo, 27 * scale, gridY + rowGap + 2.4 * scale);

      ctx.fillStyle = "#78716c";
      ctx.font = `${1.8 * scale}px sans-serif`;
      ctx.fillText("Contact Number", 4 * scale, gridY + rowGap * 2);
      ctx.fillStyle = "#1c1917";
      ctx.font = `bold ${2.1 * scale}px sans-serif`;
      ctx.fillText(student.family?.primaryPhone || "—", 4 * scale, gridY + rowGap * 2 + 2.4 * scale);

      const addressParts = [];
      if (student.family?.addressLine1) addressParts.push(student.family.addressLine1);
      if (student.family?.addressLine2) addressParts.push(student.family.addressLine2);
      if (student.family?.city) addressParts.push(student.family.city);
      if (student.family?.pincode) addressParts.push(student.family.pincode);
      const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "—";

      ctx.fillStyle = "#78716c";
      ctx.font = `${1.8 * scale}px sans-serif`;
      ctx.fillText("Residential Address", 4 * scale, gridY + rowGap * 3);
      ctx.fillStyle = "#44403c";
      ctx.font = `bold ${1.8 * scale}px sans-serif`;
      const addressWordLimit = 42;
      const addrTrunc = fullAddress.length > addressWordLimit ? fullAddress.substring(0, addressWordLimit) + "..." : fullAddress;
      ctx.fillText(addrTrunc, 4 * scale, gridY + rowGap * 3 + 2.4 * scale, 46 * scale);

      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 72 * scale, canvas.width, 14 * scale);
      ctx.fillStyle = "#fafaf9";
      ctx.fillRect(0, 72 * scale + 1, canvas.width, 14 * scale - 1);

      let sigImg: HTMLImageElement | null = null;
      if (sigUrl) {
        try {
          sigImg = await loadImage(sigUrl);
        } catch (e) {
          console.warn("Failed to load principal signature image for PDF", e);
        }
      }

      if (sigImg) {
        ctx.drawImage(sigImg, 13 * scale, 72.5 * scale, 28 * scale, 8 * scale);
      }

      ctx.strokeStyle = "#d6d3d1";
      ctx.beginPath();
      ctx.moveTo(13 * scale, 81.5 * scale);
      ctx.lineTo(41 * scale, 81.5 * scale);
      ctx.stroke();

      ctx.fillStyle = "#78716c";
      ctx.font = `bold ${1.5 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("PRINCIPAL SIGNATURE", 27 * scale, 84 * scale);

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [54, 86],
      });

      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      pdf.addImage(imgData, "JPEG", 0, 0, 54, 86);
      pdf.save(`id_card_${student.admissionNo}.pdf`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-[450px] w-full p-6 shadow-2xl border border-stone-200 flex flex-col items-center">
        <div className="flex items-center justify-between border-b pb-3 mb-4 w-full">
          <div className="flex items-center justify-between w-full">
            <span className="text-stone-800 font-bold text-lg">ID Card Preview</span>
            <div className="flex gap-1.5 shrink-0 bg-stone-100 p-1 rounded-lg mr-2">
              <Button
                variant={zoom === 1 ? "secondary" : "ghost"}
                size="xs"
                className="text-[10px] px-2 h-6"
                onClick={() => setZoom(1)}
              >
                100%
              </Button>
              <Button
                variant={zoom === 1.5 ? "secondary" : "ghost"}
                size="xs"
                className="text-[10px] px-2 h-6"
                onClick={() => setZoom(1.5)}
              >
                150%
              </Button>
              <Button
                variant={zoom === 2 ? "secondary" : "ghost"}
                size="xs"
                className="text-[10px] px-2 h-6"
                onClick={() => setZoom(2)}
              >
                200%
              </Button>
            </div>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          className="my-6 border border-stone-200 rounded-2xl p-4 bg-stone-50 overflow-auto flex items-center justify-center"
          style={{
            width: "100%",
            height: zoom === 1 ? "360px" : zoom === 1.5 ? "500px" : "600px",
            maxHeight: "65vh",
          }}
        >
          <div
            style={{
              width: "54mm",
              height: "86mm",
              transform: `scale(${1})`,
            }}
          >
            <IDCard student={student} branding={branding} selectedSessionId={selectedSessionId} zoom={zoom} />
          </div>
        </div>

        <div className="flex justify-end gap-3 w-full border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={isDownloading}>
            Close
          </Button>
          <Button variant="secondary" onClick={handleDownloadPDF} disabled={isDownloading}>
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Downloading...
              </>
            ) : (
              "Download PDF"
            )}
          </Button>
          <Button onClick={handlePrint} disabled={isDownloading}>
            Print Card
          </Button>
        </div>
      </div>
    </div>
  );
}

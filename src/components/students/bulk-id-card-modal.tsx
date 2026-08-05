"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { listStudentsAction, getStudentIdCardDataAction } from "@/server/actions/student.actions";
import { IDCard } from "./id-card";
import { jsPDF } from "jspdf";
import { Loader2, Search, CheckSquare, Square, Printer, Download, X } from "lucide-react";
import { toast } from "sonner";

interface ClassRow {
  id: string;
  name: string;
  sections: Array<{ id: string; name: string }>;
}

interface SessionRow {
  id: string;
  name: string;
}

interface BulkIDCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassRow[];
  sessions: SessionRow[];
  initialSessionId: string;
}

type StudentItem = {
  id: string;
  fullName: string;
  admissionNo: string;
  photoUrl?: string | null;
  family: {
    fatherName: string | null;
    motherName: string | null;
    primaryPhone?: string | null;
  } | null;
};

export function BulkIDCardModal({ isOpen, onClose, classes, sessions, initialSessionId }: BulkIDCardModalProps) {
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  
  const [isPending, startTransition] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isGeneratingPrint, setIsGeneratingPrint] = useState(false);

  const [zoom, setZoom] = useState<number>(1);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewBranding, setPreviewBranding] = useState<unknown | null>(null);
  const [previewStudents, setPreviewStudents] = useState<unknown[]>([]);

  // Find active sections
  const activeClass = classes.find((c) => c.id === selectedClassId);
  const activeSections = activeClass?.sections ?? [];

  // Reset section when class changes
  useEffect(() => {
    setSelectedSectionId("");
    setStudents([]);
    setSelectedStudentIds(new Set());
    setPreviewMode(false);
  }, [selectedClassId]);

  // Automatically load students when filters change
  useEffect(() => {
    if (!selectedSessionId || !selectedClassId) {
      setStudents([]);
      return;
    }

    startTransition(async () => {
      try {
        const res = await listStudentsAction({
          sessionId: selectedSessionId,
          classId: selectedClassId,
          sectionId: selectedSectionId || undefined,
          pageSize: 500,
        });
        setStudents(res.items as StudentItem[]);
        setSelectedStudentIds(new Set(res.items.map((s) => s.id)));
      } catch (err) {
        toast.error("Failed to load students for selection");
      }
    });
  }, [selectedSessionId, selectedClassId, selectedSectionId]);

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.admissionNo.toLowerCase().includes(q) ||
      s.family?.fatherName?.toLowerCase().includes(q)
    );
  });

  const handleToggleSelectAll = () => {
    const allFilteredIds = filteredStudents.map((s) => s.id);
    const someUnselected = allFilteredIds.some((id) => !selectedStudentIds.has(id));

    const newSelected = new Set(selectedStudentIds);
    if (someUnselected) {
      allFilteredIds.forEach((id) => newSelected.add(id));
    } else {
      allFilteredIds.forEach((id) => newSelected.delete(id));
    }
    setSelectedStudentIds(newSelected);
  };

  const handleToggleStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudentIds);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudentIds(newSelected);
  };

  const handleGeneratePreview = async () => {
    if (selectedStudentIds.size === 0) {
      toast.error("Please select at least one student");
      return;
    }

    setIsGeneratingPrint(true);
    try {
      const res = await getStudentIdCardDataAction(Array.from(selectedStudentIds));
      setPreviewBranding(res.branding);
      setPreviewStudents(res.students);
      setPreviewMode(true);
    } catch (e) {
      toast.error("Failed to load ID card template data");
    } finally {
      setIsGeneratingPrint(false);
    }
  };

  const handlePrintBulk = async () => {
    if (selectedStudentIds.size === 0) {
      toast.error("Please select at least one student");
      return;
    }

    setIsGeneratingPrint(true);
    try {
      const res = await getStudentIdCardDataAction(Array.from(selectedStudentIds));
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
        .map((el) => el.outerHTML)
        .join("\n");

      const cardsHtml = res.students
        .map((student) => {
          const enrollment =
            student.enrollments.find((e) => e.sessionId === selectedSessionId) ||
            student.enrollments[0];
          const sessionName = enrollment?.session?.name || "Academic Session";
          const className = enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "—";
          const rollNo = enrollment?.rollNo || "—";
          const photoUrl = student.photoUrl || "";
          const logoUrl = res.branding?.logoDocumentId ? `/api/documents/${res.branding.logoDocumentId}` : "";
          const signatureUrl = res.branding?.principalSignatureDocumentId
            ? `/api/documents/${res.branding.principalSignatureDocumentId}`
            : "";

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

          return `
            <div class="card-item relative flex flex-col bg-white border border-stone-300 text-stone-800 overflow-hidden text-left" style="width: 54mm; height: 86mm; border-radius: 4mm;">
              <!-- Watermark -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none z-0">
                <span class="text-[12px] font-extrabold uppercase rotate-45 text-center leading-tight max-w-[90%] break-words">
                  ${res.branding?.schoolName || "ERP SCHOOL"}
                </span>
              </div>
              
              <!-- Header -->
              <div class="relative z-10 bg-slate-900 text-white flex flex-col justify-center px-2 py-1.5 border-b border-amber-500 h-[18mm] shrink-0 text-center">
                <div class="flex items-center gap-1.5 justify-center">
                  ${
                    logoUrl
                      ? `<img src="${logoUrl}" alt="Logo" class="w-[8mm] h-[8mm] object-contain rounded-xs" />`
                      : `<div class="w-[8mm] h-[8mm] bg-amber-500 text-slate-900 rounded-xs flex items-center justify-center font-bold text-[10px]">${(res.branding?.schoolName || "S").charAt(0).toUpperCase()}</div>`
                  }
                  <div class="flex flex-col text-left overflow-hidden">
                    <h1 class="font-extrabold text-[8.5px] leading-tight uppercase truncate max-w-[36mm]">${res.branding?.schoolName || "ERP SCHOOL"}</h1>
                    <p class="text-[5.5px] leading-normal opacity-90 truncate max-w-[36mm]">${res.branding?.address || "School Campus Address"}</p>
                    <p class="text-[5px] leading-normal opacity-75 truncate max-w-[36mm]">${res.branding?.phone ? `Ph: ${res.branding.phone}` : ""}</p>
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
          `;
        })
        .join("\n");

      printWindow.document.write(`
        <html>
          <head>
            <title>Bulk ID Cards Print</title>
            ${styles}
            <style>
              @page {
                size: A4 portrait;
                margin: 10mm 10mm;
              }
              body {
                margin: 0;
                padding: 0;
                background-color: white;
              }
              .print-grid {
                display: grid;
                grid-template-columns: repeat(3, 54mm);
                grid-auto-rows: 86mm;
                gap: 2mm 5mm;
                justify-content: center;
              }
              .card-item {
                break-inside: avoid;
                page-break-inside: avoid;
              }
              @media print {
                .no-print {
                  display: none;
                }
              }
            </style>
          </head>
          <body>
            <div class="print-grid">
              ${cardsHtml}
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
    } catch (e) {
      toast.error("Failed to generate bulk print layout");
    } finally {
      setIsGeneratingPrint(false);
    }
  };

  const handleDownloadPDFBulk = async () => {
    if (selectedStudentIds.size === 0) {
      toast.error("Please select at least one student");
      return;
    }

    setIsDownloading(true);
    try {
      const res = await getStudentIdCardDataAction(Array.from(selectedStudentIds));

      const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load: ${src}`));
          img.src = src;
        });
      };

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const logoUrl = res.branding?.logoDocumentId ? `/api/documents/${res.branding.logoDocumentId}` : null;
      let logoImg: HTMLImageElement | null = null;
      if (logoUrl) {
        try {
          logoImg = await loadImage(logoUrl);
        } catch {}
      }

      const sigUrl = res.branding?.principalSignatureDocumentId
        ? `/api/documents/${res.branding.principalSignatureDocumentId}`
        : null;
      let sigImg: HTMLImageElement | null = null;
      if (sigUrl) {
        try {
          sigImg = await loadImage(sigUrl);
        } catch {}
      }

      const cardsPerPage = 9;
      const cardWidth = 54;
      const cardHeight = 86;
      const scale = 12;

      for (let index = 0; index < res.students.length; index++) {
        const student = res.students[index];
        const cardPos = index % cardsPerPage;

        if (index > 0 && cardPos === 0) {
          pdf.addPage();
        }

        const col = cardPos % 3;
        const row = Math.floor(cardPos / 3);

        const xMargin = 10;
        const yMargin = 10;
        const xGap = 9;
        const yGap = 5;

        const xPos = xMargin + col * (cardWidth + xGap);
        const yPos = yMargin + row * (cardHeight + yGap);

        const canvas = document.createElement("canvas");
        canvas.width = cardWidth * scale;
        canvas.height = cardHeight * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, 18 * scale);
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(0, 18 * scale - 1.5, canvas.width, 1.5);

        if (logoImg) {
          ctx.drawImage(logoImg, 3 * scale, 3 * scale, 12 * scale, 12 * scale);
        } else {
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(3 * scale, 3 * scale, 12 * scale, 12 * scale);
          ctx.fillStyle = "#0f172a";
          ctx.font = `bold ${8 * scale}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText((res.branding?.schoolName || "S").charAt(0).toUpperCase(), 9 * scale, 9 * scale);
        }

        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${3.8 * scale}px sans-serif`;
        ctx.fillText((res.branding?.schoolName || "ERP SCHOOL").toUpperCase(), 17 * scale, 6.5 * scale, 34 * scale);

        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.font = `${2.3 * scale}px sans-serif`;
        ctx.fillText(res.branding?.address || "School Campus Address", 17 * scale, 10.5 * scale, 34 * scale);

        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.font = `${2.1 * scale}px sans-serif`;
        ctx.fillText(res.branding?.phone ? `Ph: ${res.branding.phone}` : "", 17 * scale, 14 * scale, 34 * scale);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((45 * Math.PI) / 180);
        ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
        ctx.font = `bold ${4.5 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText((res.branding?.schoolName || "ERP SCHOOL").toUpperCase(), 0, 0, 48 * scale);
        ctx.restore();

        let photoImg: HTMLImageElement | null = null;
        if (student.photoUrl) {
          try {
            photoImg = await loadImage(student.photoUrl);
          } catch {}
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

        ctx.fillStyle = "#fef3c7";
        ctx.fillRect(25 * scale, 22 * scale, 25 * scale, 4 * scale);
        ctx.strokeStyle = "#fde68a";
        ctx.strokeRect(25 * scale, 22 * scale, 25 * scale, 4 * scale);
        ctx.fillStyle = "#92400e";
        ctx.font = `bold ${2.2 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sessionName.toUpperCase(), 25 * scale + 12.5 * scale, 24 * scale);

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

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        pdf.addImage(imgData, "JPEG", xPos, yPos, cardWidth, cardHeight);
      }

      pdf.save(`bulk_id_cards_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (e) {
      toast.error("Failed to generate bulk PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-[850px] w-full p-6 shadow-2xl border border-stone-200 flex flex-col max-h-[90vh]">
        <div className="border-b pb-3 shrink-0 flex flex-row items-center justify-between">
          <span className="text-stone-850 font-bold text-lg">
            {previewMode ? "Bulk ID Cards Preview" : "Generate Bulk ID Cards"}
          </span>
          <div className="flex items-center gap-2">
            {previewMode && (
              <div className="flex gap-1.5 bg-stone-100 p-1 rounded-lg">
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
            )}
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!previewMode ? (
          // FILTER & STUDENT SELECT MODE
          <div className="flex-1 overflow-y-auto min-h-0 py-4 space-y-4 text-sm flex flex-col">
            <div className="grid grid-cols-3 gap-4 shrink-0">
              <div className="space-y-1.5">
                <Label className="text-stone-500 font-semibold text-xs uppercase">Academic Session</Label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-stone-250 bg-stone-50 px-3 text-stone-700 font-medium"
                >
                  <option value="">Select Session</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-stone-500 font-semibold text-xs uppercase">Class</Label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-stone-250 bg-stone-50 px-3 text-stone-700 font-medium"
                >
                  <option value="">Select Class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-stone-500 font-semibold text-xs uppercase">Section (Optional)</Label>
                <select
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  disabled={!selectedClassId}
                  className="w-full h-9 rounded-lg border border-stone-250 bg-stone-50 px-3 text-stone-700 font-medium disabled:opacity-50"
                >
                  <option value="">All Sections</option>
                  {activeSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedClassId ? (
              <div className="flex-1 flex flex-col min-h-[300px] border border-stone-200 rounded-xl overflow-hidden bg-stone-50/30">
                <div className="border-b bg-stone-50 p-3 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleToggleSelectAll}
                      className="text-stone-600 font-semibold text-xs flex items-center gap-2 h-8 px-2"
                    >
                      {filteredStudents.length > 0 &&
                      filteredStudents.every((s) => selectedStudentIds.has(s.id)) ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      Select All Filtered
                    </button>
                    <span className="text-stone-400 font-mono text-xs">
                      {selectedStudentIds.size} / {students.length} Selected
                    </span>
                  </div>
                  <div className="relative w-64">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                    <Input
                      placeholder="Search student..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-xs rounded-lg w-full bg-white"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-stone-100 bg-white max-h-[350px]">
                  {isPending ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="text-center py-12 text-stone-400 font-medium">
                      No active students found matching filters.
                    </div>
                  ) : (
                    filteredStudents.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleToggleStudent(s.id)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(s.id)}
                          onChange={() => handleToggleStudent(s.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-stone-300"
                        />
                        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-stone-50 text-xs font-bold text-stone-500 shadow-2xs">
                          {s.photoUrl ? (
                            <img src={s.photoUrl} alt={s.fullName} className="h-full w-full object-cover" />
                          ) : (
                            s.fullName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-stone-800 text-sm truncate">{s.fullName}</p>
                          <p className="text-stone-450 text-[11px] font-mono">
                            Adm: {s.admissionNo} • Father: {s.family?.fatherName || "—"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-xl bg-stone-50 text-stone-400 gap-2">
                <span className="text-3xl">📇</span>
                <p className="font-semibold">Select Session and Class</p>
                <p className="text-xs max-w-sm">
                  Please specify Academic Session and Class filters above to retrieve the student selection list.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t pt-4 shrink-0">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGeneratePreview}
                disabled={isPending || selectedStudentIds.size === 0 || isGeneratingPrint}
              >
                {isGeneratingPrint ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Preparing Preview...
                  </>
                ) : (
                  "Generate Preview"
                )}
              </Button>
            </div>
          </div>
        ) : (
          // LIVE PREVIEW MODE WITH ZOOM
          <div className="flex-1 flex flex-col overflow-hidden py-4 text-sm">
            <div className="flex-1 overflow-auto border border-stone-200 rounded-xl p-6 bg-stone-100 flex items-center justify-center min-h-[350px]">
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                style={{
                  transform: `scale(${1})`,
                  transformOrigin: "top center",
                }}
              >
                {previewStudents.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      width: "54mm",
                      height: "86mm",
                      transform: `scale(${1})`,
                    }}
                  >
                    <IDCard
                      student={s}
                      branding={previewBranding}
                      selectedSessionId={selectedSessionId}
                      zoom={zoom}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center border-t pt-4 shrink-0 mt-4">
              <Button variant="outline" onClick={() => setPreviewMode(false)} disabled={isDownloading || isGeneratingPrint}>
                Back to Selection
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} disabled={isDownloading || isGeneratingPrint}>
                  Close
                </Button>
                <Button variant="secondary" onClick={handleDownloadPDFBulk} disabled={isDownloading || isGeneratingPrint}>
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Downloading PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </>
                  )}
                </Button>
                <Button onClick={handlePrintBulk} disabled={isDownloading || isGeneratingPrint}>
                  {isGeneratingPrint ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Printing...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4 mr-2" />
                      Print Selected
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

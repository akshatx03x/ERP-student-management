"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getStudentReceiptsForClassAction, getBulkReceiptsDataAction } from "@/server/actions/fee.actions";
import { SingleFeeReceipt } from "@/components/fees/fee-receipt-single";
import { jsPDF } from "jspdf";
import { Loader2, Search, CheckSquare, Square, Printer, Download, X, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatCurrency } from "@/lib/utils";

interface ClassRow {
  id: string;
  name: string;
  sections: Array<{ id: string; name: string }>;
}

interface SessionRow {
  id: string;
  name: string;
}

interface BulkReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassRow[];
  sessions: SessionRow[];
  initialSessionId: string;
  initialClassId?: string;
}

type StudentWithReceipts = Awaited<ReturnType<typeof getStudentReceiptsForClassAction>>[number];

export function BulkReceiptModal({
  isOpen,
  onClose,
  classes,
  sessions,
  initialSessionId,
  initialClassId = "",
}: BulkReceiptModalProps) {
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [students, setStudents] = useState<StudentWithReceipts[]>([]);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());

  const [isPending, startTransition] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isGeneratingPrint, setIsGeneratingPrint] = useState(false);

  const activeClass = classes.find((c) => c.id === selectedClassId);
  const activeSections = activeClass?.sections ?? [];

  useEffect(() => {
    if (!selectedSessionId || !selectedClassId) {
      setStudents([]);
      setSelectedPaymentIds(new Set());
      return;
    }

    startTransition(async () => {
      try {
        const res = await getStudentReceiptsForClassAction({
          sessionId: selectedSessionId,
          classId: selectedClassId,
          sectionId: selectedSectionId || undefined,
        });
        setStudents(res);

        // Auto-select all available receipts for all students initially
        const allPids = new Set<string>();
        for (const s of res) {
          for (const p of s.payments) {
            allPids.add(p.paymentId);
          }
        }
        setSelectedPaymentIds(allPids);
      } catch (err) {
        toast.error("Failed to load student receipts");
      }
    });
  }, [selectedSessionId, selectedClassId, selectedSectionId]);

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.admissionNo.toLowerCase().includes(q) ||
      s.fatherName.toLowerCase().includes(q)
    );
  });

  const totalAvailableReceipts = students.reduce((sum, s) => sum + s.payments.length, 0);

  const handleToggleSelectAll = () => {
    const allFilteredPaymentIds = new Set<string>();
    for (const s of filteredStudents) {
      for (const p of s.payments) {
        allFilteredPaymentIds.add(p.paymentId);
      }
    }

    const someUnselected = Array.from(allFilteredPaymentIds).some((id) => !selectedPaymentIds.has(id));
    const newSelected = new Set(selectedPaymentIds);

    if (someUnselected) {
      allFilteredPaymentIds.forEach((id) => newSelected.add(id));
    } else {
      allFilteredPaymentIds.forEach((id) => newSelected.delete(id));
    }
    setSelectedPaymentIds(newSelected);
  };

  const handleToggleStudentAllReceipts = (student: StudentWithReceipts) => {
    const studentPids = student.payments.map((p) => p.paymentId);
    const someUnselected = studentPids.some((id) => !selectedPaymentIds.has(id));
    const newSelected = new Set(selectedPaymentIds);

    if (someUnselected) {
      studentPids.forEach((id) => newSelected.add(id));
    } else {
      studentPids.forEach((id) => newSelected.delete(id));
    }
    setSelectedPaymentIds(newSelected);
  };

  const handleTogglePayment = (paymentId: string) => {
    const newSelected = new Set(selectedPaymentIds);
    if (newSelected.has(paymentId)) {
      newSelected.delete(paymentId);
    } else {
      newSelected.add(paymentId);
    }
    setSelectedPaymentIds(newSelected);
  };

  const handlePrintBulk = async () => {
    if (selectedPaymentIds.size === 0) {
      toast.error("Please select at least one receipt to print");
      return;
    }

    setIsGeneratingPrint(true);
    try {
      const res = await getBulkReceiptsDataAction(Array.from(selectedPaymentIds));
      if (!res.receipts || res.receipts.length === 0) {
        toast.error("No receipt data found");
        return;
      }

      // Use hidden iframe to avoid browser popup blockers and guarantee print preview
      let iframe = document.getElementById("bulk-print-receipt-iframe") as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.id = "bulk-print-receipt-iframe";
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "210mm";
        iframe.style.height = "297mm";
        iframe.style.border = "0";
        iframe.style.opacity = "0";
        iframe.style.pointerEvents = "none";
        iframe.style.zIndex = "-9999";
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) {
        toast.error("Unable to initialize print preview");
        return;
      }

      const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
        .map((el) => el.outerHTML)
        .join("\n");

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Bulk Fee Receipts Print</title>
            ${styles}
            <style>
              @page {
                size: A4 portrait;
                margin: 5mm;
              }
              body {
                background: #ffffff !important;
                color: #000000 !important;
                margin: 0 !important;
                padding: 0 !important;
                font-family: system-ui, -apple-system, sans-serif;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              #print-root, .fee-receipt-print-wrapper, .printable-area {
                display: block !important;
                visibility: visible !important;
                width: 100% !important;
              }
              .receipt-page {
                page-break-inside: avoid;
                break-inside: avoid;
                page-break-after: always;
                break-after: page;
                margin-bottom: 4mm;
              }
              @media print {
                .no-print { display: none !important; }
              }
            </style>
          </head>
          <body>
            <div id="print-root" class="fee-receipt-print-wrapper printable-area"></div>
          </body>
        </html>
      `);
      doc.close();

      // Render React components into print window
      const container = doc.getElementById("print-root");
      if (container) {
        const ReactDOM = (await import("react-dom/client")).default;
        const root = ReactDOM.createRoot(container);
        root.render(
          <div style={{ display: "flex", flexDirection: "column", gap: "4mm" }}>
            {res.receipts.map((r, idx) => (
              <div key={idx} className="receipt-page" style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "stretch", width: "100%", maxWidth: "195mm", backgroundColor: "#ffffff" }}>
                <SingleFeeReceipt data={r.snapshot as any} copyType="SCHOOL COPY" isSideBySide={true} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "3%" }}>
                  <div style={{ height: "100%", borderLeft: "2px dashed #a8a29e" }} />
                </div>
                <SingleFeeReceipt data={r.snapshot as any} copyType="PARENT COPY" isSideBySide={true} />
              </div>
            ))}
          </div>
        );

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setIsGeneratingPrint(false);
        }, 600);
      } else {
        setIsGeneratingPrint(false);
      }
    } catch (e) {
      toast.error("Failed to generate bulk print layout");
      setIsGeneratingPrint(false);
    }
  };

  const handleDownloadPDFBulk = async () => {
    if (selectedPaymentIds.size === 0) {
      toast.error("Please select at least one receipt to generate PDF");
      return;
    }

    setIsDownloading(true);
    try {
      const res = await getBulkReceiptsDataAction(Array.from(selectedPaymentIds));
      if (!res.receipts || res.receipts.length === 0) {
        toast.error("No receipt data found");
        return;
      }

      // Create hidden container to render receipts into HTML canvas
      const renderContainer = document.createElement("div");
      renderContainer.style.position = "absolute";
      renderContainer.style.left = "-9999px";
      renderContainer.style.top = "-9999px";
      renderContainer.style.width = "210mm";
      document.body.appendChild(renderContainer);

      const html2canvas = (await import("html2canvas")).default;
      const ReactDOM = (await import("react-dom/client")).default;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // Batch receipts into pages with maximum 3 receipts per physical page
      const maxReceiptsPerPage = 3;
      const totalPages = Math.ceil(res.receipts.length / maxReceiptsPerPage);

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        if (pageIdx > 0) pdf.addPage();

        const pageReceipts = res.receipts.slice(
          pageIdx * maxReceiptsPerPage,
          (pageIdx + 1) * maxReceiptsPerPage
        );

        renderContainer.innerHTML = "";
        const pageWrapper = document.createElement("div");
        pageWrapper.style.width = "195mm";
        pageWrapper.style.backgroundColor = "#ffffff";
        pageWrapper.style.padding = "4mm";
        pageWrapper.style.boxSizing = "border-box";
        renderContainer.appendChild(pageWrapper);

        const root = ReactDOM.createRoot(pageWrapper);
        root.render(
          <div style={{ display: "flex", flexDirection: "column", gap: "4mm", width: "100%", backgroundColor: "#ffffff" }}>
            {pageReceipts.map((item, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "stretch", width: "100%", backgroundColor: "#ffffff" }}>
                <SingleFeeReceipt data={item.snapshot as any} copyType="SCHOOL COPY" isSideBySide={true} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "3%" }}>
                  <div style={{ height: "100%", borderLeft: "2px dashed #a8a29e" }} />
                </div>
                <SingleFeeReceipt data={item.snapshot as any} copyType="PARENT COPY" isSideBySide={true} />
              </div>
            ))}
          </div>
        );

        // Wait for React render cycle
        await new Promise((r) => setTimeout(r, 150));

        const canvas = await html2canvas(pageWrapper, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
        root.unmount();
      }

      document.body.removeChild(renderContainer);
      const selectedClass = classes.find((c) => c.id === selectedClassId);
      const selectedSession = sessions.find((s) => s.id === selectedSessionId);
      const classSlug = selectedClass ? selectedClass.name.replace(/[^a-zA-Z0-9_-]/g, "_") : "All_Classes";
      const sessionSlug = selectedSession ? selectedSession.name.replace(/[^a-zA-Z0-9_-]/g, "_") : "Session";
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `Fee_Receipts_${classSlug}_${sessionSlug}_${dateStr}.pdf`;

      pdf.save(fileName);
      toast.success(`Bulk receipts saved as ${fileName}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate bulk PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-[850px] w-full p-6 shadow-2xl border border-stone-200 flex flex-col max-h-[90vh]">
        <div className="border-b pb-3 shrink-0 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            <span className="text-stone-850 font-bold text-lg">Class-Wise Bulk Fee Receipts</span>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FILTERS SECTION */}
        <div className="py-4 space-y-4 text-sm flex flex-col flex-1 min-h-0">
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
                    className="text-stone-700 font-semibold text-xs flex items-center gap-2 h-8 px-2 cursor-pointer hover:bg-stone-200/60 rounded"
                  >
                    {totalAvailableReceipts > 0 && selectedPaymentIds.size === totalAvailableReceipts ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    Select All Receipts
                  </button>
                  <span className="text-stone-500 font-mono text-xs font-bold bg-stone-200/80 px-2 py-0.5 rounded-full">
                    Selected: {selectedPaymentIds.size} receipts
                  </span>
                </div>
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                  <Input
                    placeholder="Search student or father..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs rounded-lg w-full bg-white"
                  />
                </div>
              </div>

              {/* STUDENT RECEIPT LIST */}
              <div className="flex-1 overflow-y-auto divide-y divide-stone-100 bg-white max-h-[380px]">
                {isPending ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="text-center py-12 text-stone-400 font-medium">
                    No student receipts found matching filters.
                  </div>
                ) : (
                  filteredStudents.map((student) => {
                    const studentPids = student.payments.map((p) => p.paymentId);
                    const allSelected = studentPids.length > 0 && studentPids.every((id) => selectedPaymentIds.has(id));

                    return (
                      <div key={student.studentId} className="p-3 hover:bg-stone-50/60 transition-colors">
                        <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleStudentAllReceipts(student)}
                              className="text-stone-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              {allSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4 text-stone-400" />
                              )}
                              <span className="font-bold text-stone-900 text-sm">{student.fullName}</span>
                            </button>
                            <span className="text-[11px] text-stone-450 font-mono">
                              Adm: {student.admissionNo} • Class: {student.classLabel} • Father: {student.fatherName}
                            </span>
                          </div>
                          <span className="text-[10px] text-stone-400 font-semibold uppercase">
                            {student.payments.length} Receipt(s)
                          </span>
                        </div>

                        {/* BOUNDED SCROLL CONTAINER FOR INDIVIDUAL STUDENT RECEIPT LIST */}
                        <div className="pl-6 pt-2 max-h-36 overflow-y-auto space-y-1.5 pr-1.5">
                          {student.payments.length === 0 ? (
                            <p className="text-[11px] text-stone-400 italic">No payments recorded yet</p>
                          ) : (
                            student.payments.map((p) => {
                              const isChecked = selectedPaymentIds.has(p.paymentId);
                              const monthsLabel = p.months.length > 0 ? p.months.join(", ") : "Session Fee";
                              const receiptDisplay = p.receiptNumber ? `#${p.receiptNumber}` : p.receiptNo;

                              return (
                                <label
                                  key={p.paymentId}
                                  className="flex items-center justify-between p-2 rounded-lg border border-stone-200 bg-stone-50/50 hover:bg-stone-100/70 cursor-pointer text-xs"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleTogglePayment(p.paymentId)}
                                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-stone-300"
                                    />
                                    <span className="font-mono font-bold text-stone-800 bg-stone-200/70 px-1.5 py-0.5 rounded text-[11px]">
                                      {receiptDisplay}
                                    </span>
                                    <span className="font-semibold text-stone-700">{monthsLabel}</span>
                                    <span className="text-stone-400 font-medium">• {formatDate(p.paidAt)}</span>
                                  </div>
                                  <span className="font-mono font-bold text-stone-900 text-xs">
                                    {formatCurrency(p.amount)}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center border border-dashed border-stone-300 rounded-xl py-12 text-stone-400 font-medium">
              Select a class to view and select student fee receipts.
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="border-t pt-4 flex items-center justify-between shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={selectedPaymentIds.size === 0 || isGeneratingPrint}
              onClick={handlePrintBulk}
              className="border-stone-800 text-stone-900 font-bold hover:bg-stone-100"
            >
              {isGeneratingPrint ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Preparing Print...
                </>
              ) : (
                <>
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Selected ({selectedPaymentIds.size})
                </>
              )}
            </Button>

            <Button
              size="sm"
              disabled={selectedPaymentIds.size === 0 || isDownloading}
              onClick={handleDownloadPDFBulk}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Generate PDF ({selectedPaymentIds.size})
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

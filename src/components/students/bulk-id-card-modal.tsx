"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { listStudentsAction, getStudentIdCardDataAction } from "@/server/actions/student.actions";
import { IDCard, StudentProps, BrandingProps } from "./id-card";
import { printBulkIDCards, downloadBulkIDCardsPDF } from "./id-card-printer";
import { Loader2, Search, CheckSquare, Square, Printer, Download, X } from "lucide-react";
import { toast } from "sonner";

type IdCardData = Awaited<ReturnType<typeof getStudentIdCardDataAction>>;
type PreviewStudent = IdCardData["students"][number];
type PreviewBranding = IdCardData["branding"];

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

export function BulkIDCardModal({
  isOpen,
  onClose,
  classes,
  sessions,
  initialSessionId,
}: BulkIDCardModalProps) {
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  const [isPending, startTransition] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [isGeneratingPrint, setIsGeneratingPrint] = useState(false);

  const [zoom, setZoom] = useState<number>(1);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewBranding, setPreviewBranding] = useState<PreviewBranding | null>(null);
  const [previewStudents, setPreviewStudents] = useState<PreviewStudent[]>([]);

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
      } catch {
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
    } catch {
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
      await printBulkIDCards(
        res.students as unknown as StudentProps[],
        res.branding as unknown as BrandingProps,
        selectedSessionId
      );
    } catch (e) {
      console.error(e);
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
    setDownloadProgress("0 / " + selectedStudentIds.size);
    try {
      const res = await getStudentIdCardDataAction(Array.from(selectedStudentIds));
      await downloadBulkIDCardsPDF(
        res.students as unknown as StudentProps[],
        res.branding as unknown as BrandingProps,
        selectedSessionId,
        `bulk_id_cards_${new Date().toISOString().split("T")[0]}.pdf`,
        (current, total) => {
          setDownloadProgress(`${current} / ${total}`);
        }
      );
      toast.success("Bulk ID cards downloaded successfully");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate bulk PDF");
    } finally {
      setIsDownloading(false);
      setDownloadProgress("");
    }
  };
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl w-full p-6 shadow-2xl border border-stone-200 flex flex-col max-h-[92vh] transition-all ${previewMode ? "max-w-[1150px]" : "max-w-[900px]"}`}>
        {/* Modal Header */}
        <div className="border-b pb-3 shrink-0 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-stone-850 font-bold text-lg">
              {previewMode ? "Bulk ID Cards Preview" : "Generate Bulk ID Cards"}
            </span>
            {previewMode && (
              <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-semibold">
                A4 Landscape • 10 Cards / Page (5.2cm × 8.4cm)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {previewMode && (
              <div className="flex gap-1.5 bg-stone-100 p-1 rounded-lg">
                <Button
                  variant={zoom === 1 ? "secondary" : "ghost"}
                  size="sm"
                  className="text-[10px] px-2 h-6 font-semibold"
                  onClick={() => setZoom(1)}
                >
                  100%
                </Button>
                <Button
                  variant={zoom === 1.25 ? "secondary" : "ghost"}
                  size="sm"
                  className="text-[10px] px-2 h-6 font-semibold"
                  onClick={() => setZoom(1.25)}
                >
                  125%
                </Button>
                <Button
                  variant={zoom === 1.5 ? "secondary" : "ghost"}
                  size="sm"
                  className="text-[10px] px-2 h-6 font-semibold"
                  onClick={() => setZoom(1.5)}
                >
                  150%
                </Button>
              </div>
            )}
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 p-1 rounded-md transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!previewMode ? (
          // FILTER & STUDENT SELECT MODE
          <div className="flex-1 overflow-y-auto min-h-0 py-4 space-y-4 text-sm flex flex-col">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
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
                        <CheckSquare className="w-4 h-4 text-blue-600" />
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
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
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
                className="bg-stone-900 text-white hover:bg-stone-800"
              >
                {isGeneratingPrint ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Preparing Preview...
                  </>
                ) : (
                  `Preview Cards (${selectedStudentIds.size})`
                )}
              </Button>
            </div>
          </div>
        ) : (
          // LIVE PREVIEW MODE WITH ZOOM
          <div className="flex-1 flex flex-col overflow-hidden py-4 text-sm">
            <div className="flex-1 overflow-auto border border-stone-200 rounded-xl p-6 bg-stone-100/70 flex items-start justify-center min-h-[380px] max-h-[65vh]">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 justify-items-center">
                {previewStudents.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      width: `${52 * zoom}mm`,
                      height: `${84 * zoom}mm`,
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                    }}
                  >
                    <IDCard
                      student={s as unknown as StudentProps}
                      branding={previewBranding as unknown as BrandingProps}
                      selectedSessionId={selectedSessionId}
                      zoom={zoom}
                      cardWidth={52}
                      cardHeight={84}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center border-t pt-4 shrink-0 mt-4">
              <Button
                variant="outline"
                onClick={() => setPreviewMode(false)}
                disabled={isDownloading || isGeneratingPrint}
              >
                Back to Selection
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isDownloading || isGeneratingPrint}
                >
                  Close
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleDownloadPDFBulk}
                  disabled={isDownloading || isGeneratingPrint}
                  className="flex items-center gap-1.5"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Downloading PDF {downloadProgress ? `(${downloadProgress})` : ""}...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download PDF
                    </>
                  )}
                </Button>
                <Button
                  onClick={handlePrintBulk}
                  disabled={isDownloading || isGeneratingPrint}
                  className="bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-1.5"
                >
                  {isGeneratingPrint ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Opening Print...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      Print Selected ({selectedStudentIds.size})
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

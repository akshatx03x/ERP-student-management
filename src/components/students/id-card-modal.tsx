"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { IDCard, StudentProps, BrandingProps } from "./id-card";
import { printSingleIDCard, downloadSingleIDCardPDF } from "./id-card-printer";
import { Loader2, X, Printer, Download } from "lucide-react";
import { toast } from "sonner";

interface IDCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentProps;
  branding: BrandingProps | null;
  selectedSessionId: string;
}

export function IDCardModal({
  isOpen,
  onClose,
  student,
  branding,
  selectedSessionId,
}: IDCardModalProps) {
  const [zoom, setZoom] = useState<number>(1.5);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printSingleIDCard(student, branding, selectedSessionId);
    } catch (err) {
      console.error(err);
      toast.error("Failed to open print preview");
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      await downloadSingleIDCardPDF(student, branding, selectedSessionId);
      toast.success("ID card downloaded successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to download ID card PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-[480px] w-full p-6 shadow-2xl border border-stone-200 flex flex-col items-center">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4 w-full">
          <span className="text-stone-800 font-bold text-lg">Student ID Card</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 shrink-0 bg-stone-100 p-1 rounded-lg">
              <Button
                variant={zoom === 1 ? "secondary" : "ghost"}
                size="sm"
                className="text-[10px] px-2 h-6 font-semibold"
                onClick={() => setZoom(1)}
              >
                100%
              </Button>
              <Button
                variant={zoom === 1.5 ? "secondary" : "ghost"}
                size="sm"
                className="text-[10px] px-2 h-6 font-semibold"
                onClick={() => setZoom(1.5)}
              >
                150%
              </Button>
              <Button
                variant={zoom === 2 ? "secondary" : "ghost"}
                size="sm"
                className="text-[10px] px-2 h-6 font-semibold"
                onClick={() => setZoom(2)}
              >
                200%
              </Button>
            </div>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 p-1 rounded-md transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Preview Area */}
        <div
          className="my-3 border border-stone-200 rounded-2xl p-6 bg-stone-100/70 overflow-auto flex items-center justify-center w-full shadow-inner"
          style={{
            minHeight: "360px",
            maxHeight: "65vh",
          }}
        >
          {/* Preview container */}
          <div
            ref={cardRef}
            style={{
              position: "relative",
              width: `${53.25 * zoom}mm`,
              height: `${86 * zoom}mm`,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-start",
            }}
          >
            <IDCard
              student={student}
              branding={branding}
              selectedSessionId={selectedSessionId}
              zoom={zoom}
              cardWidth={53.25}
              cardHeight={86}
            />
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex justify-between items-center w-full border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={isDownloading || isPrinting}>
            Close
          </Button>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleDownloadPDF}
              disabled={isDownloading || isPrinting}
              className="flex items-center gap-1.5"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download PDF
                </>
              )}
            </Button>

            <Button
              onClick={handlePrint}
              disabled={isDownloading || isPrinting}
              className="bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-1.5"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Opening Print...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  Print Card
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

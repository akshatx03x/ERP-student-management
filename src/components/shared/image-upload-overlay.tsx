"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ImageUploadOverlayProps = {
  label?: string;
  className?: string;
  fullScreen?: boolean;
};

export function ImageUploadOverlay({
  label = "Uploading…",
  className,
  fullScreen,
}: ImageUploadOverlayProps) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[100] bg-stone-900/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white select-none">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
        <p className="text-sm font-extrabold tracking-wide uppercase">{label}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-stone-900/60 text-white rounded-[inherit]",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-center px-1">{label}</span>
    </div>
  );
}

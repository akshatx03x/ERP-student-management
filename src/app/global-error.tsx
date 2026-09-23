"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, RotateCcw, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error("[GlobalError] Unhandled error captured:", error);
  }, [error]);

  const rawMessage = error.message || "";
  const isGenericServerRenderError =
    rawMessage.includes("Server Components render") ||
    rawMessage.includes("omitted in production") ||
    rawMessage.includes("digest");

  const digest = error.digest || (rawMessage.match(/digest:\s*(\w+)/i)?.[1]);

  const copyDigest = () => {
    if (digest) {
      navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-stone-100 p-6 text-stone-900 font-sans">
        <div className="max-w-lg w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-xl text-left space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-100">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-stone-900">
                {isGenericServerRenderError ? "Application Service Notice" : "Application Error"}
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed">
                {isGenericServerRenderError
                  ? "An unexpected issue occurred while rendering the application. This may be resolved by refreshing the page or restarting the desktop app."
                  : rawMessage || "An unexpected error occurred during rendering."}
              </p>
            </div>
          </div>

          {digest && (
            <div className="flex items-center justify-between rounded-xl bg-stone-50 border border-stone-200 px-4 py-2.5 text-xs text-stone-600">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-700">Reference ID:</span>
                <code className="font-mono font-bold text-stone-900 bg-stone-200/70 px-2 py-0.5 rounded">
                  #{digest}
                </code>
              </div>
              <button
                onClick={copyDigest}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-stone-900 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy ID"}
              </button>
            </div>
          )}

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors"
            >
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showDetails ? "Hide technical diagnostic details" : "Show technical diagnostic details"}
            </button>

            {showDetails && (
              <div className="mt-2.5 rounded-xl bg-stone-900 p-4 text-xs font-mono text-stone-200 overflow-x-auto max-h-48 border border-stone-800 space-y-1">
                <p className="text-rose-400 font-semibold">{rawMessage || "Error: Unknown server exception"}</p>
                {error.stack && (
                  <p className="text-stone-400 text-[11px] whitespace-pre-wrap mt-2">{error.stack}</p>
                )}
                <p className="text-stone-500 text-[10px] mt-2 border-t border-stone-800 pt-2">
                  Tip: Detailed logs are written to logs/server.log in the desktop installation directory.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Page
            </button>
            <button
              onClick={() => reset()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

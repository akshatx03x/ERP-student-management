"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError] Unhandled error captured:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full rounded-xl border border-red-200 bg-red-50/50 p-8 shadow-sm text-left space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold">
            !
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Something went wrong</h2>
            <p className="text-xs text-slate-500">An error occurred while loading this section.</p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-900 p-4 text-xs font-mono text-slate-100 overflow-x-auto">
          <p className="font-semibold text-red-400">{error.message || "Server Error"}</p>
          {error.digest && (
            <p className="mt-2 text-slate-400">
              <span className="text-slate-500">Digest:</span> {error.digest}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}

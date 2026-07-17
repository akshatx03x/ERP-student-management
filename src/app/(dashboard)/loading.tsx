/**
 * Dashboard loading skeleton.
 *
 * This file enables React Suspense streaming for all (dashboard) routes.
 * When a user navigates to any dashboard page, Next.js immediately streams
 * the layout (sidebar + header) and renders this skeleton in place of the
 * page content — giving instant visual feedback instead of a frozen screen.
 *
 * The skeleton is replaced by the real page content once server data fetching
 * completes.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading page content">
      {/* Page header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-72 rounded bg-slate-100 dark:bg-slate-800" />
      </div>

      {/* Metric cards skeleton — matches the dashboard card grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-5 shadow-sm flex items-center justify-between"
          >
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-700" />
              <div className="h-7 w-16 rounded bg-slate-200 dark:bg-slate-600" />
              <div className="h-3 w-32 rounded bg-slate-100 dark:bg-slate-700" />
            </div>
            <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-700" />
          </div>
        ))}
      </div>

      {/* Content area skeleton — table rows */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
        <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 flex gap-4">
          <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-600" />
          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-600" />
          <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-600" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border-b last:border-0 border-slate-100 dark:border-slate-700/50 px-4 py-3 flex gap-4 items-center"
          >
            <div className="h-4 w-20 rounded bg-slate-100 dark:bg-slate-700" />
            <div className="h-4 w-40 rounded bg-slate-100 dark:bg-slate-700" />
            <div className="h-4 w-28 rounded bg-slate-100 dark:bg-slate-700" />
            <div className="ml-auto h-6 w-16 rounded-full bg-slate-100 dark:bg-slate-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

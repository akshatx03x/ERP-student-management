import { Loader2, Inbox, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingState({ className, label = "Loading…" }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex min-h-[200px] flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-500">
        <Inbox className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-800">{title}</h3>
      {description ? <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description }: { title?: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50/50 p-6 text-center shadow-sm">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="mt-3 font-semibold text-red-800">{title}</h3>
      {description ? <p className="mt-1 text-sm text-red-600/80">{description}</p> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="mt-2.5 text-3xl font-bold tracking-tight text-slate-800">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-slate-500 font-medium">{hint}</p> : null}
    </div>
  );
}


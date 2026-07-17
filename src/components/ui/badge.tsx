import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & { variant?: "default" | "secondary" | "outline" | "success" | "warning" | "destructive" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold",
        variant === "default" && "border-transparent bg-primary text-primary-foreground",
        variant === "secondary" && "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
        variant === "outline" && "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300",
        variant === "success" && "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
        variant === "warning" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
        variant === "destructive" && "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
        className,
      )}
      {...props}
    />
  );
}

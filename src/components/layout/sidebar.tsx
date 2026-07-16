"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/config/permissions";
import { cn } from "@/lib/utils";

export function Sidebar({
  schoolName,
  allowedResources,
}: {
  schoolName: string;
  allowedResources: string[];
}) {
  const pathname = usePathname();

  return (
    <aside className="no-print flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-5 py-5">
        <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          School ERP
        </p>
        <h1 className="mt-1 truncate text-base font-semibold text-foreground">{schoolName}</h1>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) =>
            allowedResources.includes(item.resource),
          );
          if (items.length === 0) return null;

          return (
            <div key={group.label}>
              <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

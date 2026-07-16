"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/config/permissions";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";

export function Sidebar({
  schoolName,
  allowedResources,
}: {
  schoolName: string;
  allowedResources: string[];
}) {
  const pathname = usePathname();

  return (
    <aside className="no-print flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-foreground/10 relative overflow-hidden">
      {/* Decorative gradient blur background */}
      <div className="absolute -left-12 -top-12 h-36 w-36 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
      <div className="absolute -right-16 -bottom-16 h-48 w-48 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

      {/* Top Branding Section */}
      <div className="relative z-10 border-b border-sidebar-foreground/10 px-5 py-5 flex items-center gap-3">
        {/* Book Icon SVG */}
        <div className="bg-white/10 rounded-lg p-1.5 shrink-0 border border-white/15">
          <svg width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 28V10C4 8.9 4.9 8 6 8H18V28H6C4.9 28 4 27.1 4 26V28Z" fill="white" />
            <path d="M18 8H30C31.1 8 32 8.9 32 10V26C32 27.1 31.1 28 30 28H18V8Z" fill="white" />
            <path d="M16 6L18 4L20 6V8H16V6Z" fill="white" />
            <rect x="8" y="12" width="6" height="1.5" rx="0.75" fill="#1a1a2e" opacity="0.8" />
            <rect x="8" y="15" width="8" height="1.5" rx="0.75" fill="#1a1a2e" opacity="0.8" />
            <rect x="8" y="18" width="6" height="1.5" rx="0.75" fill="#1a1a2e" opacity="0.8" />
          </svg>
        </div>
        <div className="truncate">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-sidebar-muted leading-none">Academia</p>
          <h1 className="mt-1 truncate text-[14px] font-bold text-white tracking-tight leading-tight" title={schoolName}>
            {schoolName}
          </h1>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="relative z-10 flex-1 space-y-6 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) =>
            allowedResources.includes(item.resource),
          );
          if (items.length === 0) return null;

          return (
            <div key={group.label} className="space-y-2">
              <p className="px-2 text-[10px] font-bold tracking-[0.1em] text-sidebar-muted uppercase">
                {group.label}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);

                  // Dynamically lookup the Lucide icon, fallback to HelpCircle if not found
                  const IconComp = (Icons as any)[item.icon] || Icons.HelpCircle;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 group",
                        active
                          ? "bg-primary text-primary-foreground shadow-md shadow-indigo-900/40"
                          : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-white hover:pl-3.5"
                      )}
                    >
                      <IconComp
                        className={cn(
                          "h-[18px] w-[18px] transition-transform duration-150 group-hover:scale-105 shrink-0",
                          active ? "text-white" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                        )}
                      />
                      <span className="truncate">{item.title}</span>
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


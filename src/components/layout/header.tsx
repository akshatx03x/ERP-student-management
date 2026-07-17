"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/layout/global-search";

export function Header({
  userName,
  role,
}: {
  userName: string;
  role: string;
}) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  }

  // Get initials for user avatar
  const initials = userName
    ? userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
    : "U";

  return (
    <header className="no-print flex h-16 items-center gap-4 border-b border-border bg-card px-6 shadow-sm shadow-slate-100/50">
      <div className="max-w-md flex-1">
        <GlobalSearch />
      </div>

      <div className="ml-auto flex items-center gap-4">
        {/* User Info & Avatar */}
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-800 leading-none">{userName}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
              {role}
            </p>
          </div>
          <div className="h-9 w-9 bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold flex items-center justify-center rounded-full text-[13px] uppercase select-none shadow-sm">
            {initials}
          </div>
        </div>

        <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            className="h-9 gap-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            onClick={signOut}
          >
            <LogOut className="h-[17px] w-[17px]" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
          </div>
      </div>
    </header>
  );
}


"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun, LogOut } from "lucide-react";
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
  const { theme, setTheme } = useTheme();

  async function signOut() {
    await authClient.signOut();
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="no-print flex h-14 items-center gap-3 border-b border-border bg-card px-5">
      <div className="max-w-md flex-1">
        <GlobalSearch />
      </div>
      <div className="ml-auto hidden text-right sm:block">
        <p className="text-sm font-medium leading-none">{userName}</p>
        <p className="mt-1 text-xs text-muted-foreground">{role}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <Sun className="h-4 w-4 dark:hidden" />
        <Moon className="hidden h-4 w-4 dark:block" />
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={signOut}>
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </header>
  );
}

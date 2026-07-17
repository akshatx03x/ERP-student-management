"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/auth-redirect";
import { Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (result.error) {
        toast.error(result.error.message || "Invalid email or password");
        setLoading(false);
        return;
      }

      router.push(safeRedirectPath(searchParams.get("redirect")));
      router.refresh();
    } catch {
      toast.error("Unable to sign in");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Email */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </span>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Username or Email"
          autoComplete="email"
          required
          className="w-full rounded-lg bg-slate-100 pl-10 pr-4 py-3 text-sm text-slate-700 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
        />
      </div>

      {/* Password */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </span>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg bg-slate-100 pl-10 pr-4 py-3 text-sm text-slate-700 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
        />
      </div>

      {/* Forgot password */}
      <div className="text-right">
        <span className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 transition">
          Forgot password?
        </span>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#1a1a2e] py-3 text-sm font-semibold text-white hover:bg-[#16213e] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
        {loading ? "Signing in…" : "Login"}
      </button>

      {/* Register link */}
      <p className="text-center text-sm text-slate-400 pt-1">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-[#1a1a2e] hover:underline">
          Register
        </Link>
      </p>
    </form>
  );
}

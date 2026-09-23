"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/auth-redirect";
import { Loader2, AlertTriangle, KeyRound, Mail } from "lucide-react";
import { signInWithPinAction } from "@/server/actions/pin-auth.actions";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"EMAIL" | "PIN">("EMAIL");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const errorParam = searchParams.get("error");
  const isInactive = errorParam === "inactive";

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (result.error) {
        const msg = result.error.message || "";
        const code = result.error.code || "";
        
        let friendlyMessage = "Invalid credentials. Please verify your login details.";
        if (code === "USER_NOT_FOUND" || msg.toLowerCase().includes("user not found") || msg.toLowerCase().includes("not exist")) {
          friendlyMessage = "User account does not exist.";
        } else if (code === "INVALID_PASSWORD" || msg.toLowerCase().includes("password")) {
          friendlyMessage = "Incorrect password or mail. Please try again.";
        } else if (msg.toLowerCase().includes("deactivated") || msg.toLowerCase().includes("inactive")) {
          friendlyMessage = "Your account has been deactivated. Please contact the Principal.";
        } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("server")) {
          friendlyMessage = "Server is currently unavailable. Please try again later.";
        }
        
        setLoginError(friendlyMessage);
        toast.error(friendlyMessage);
        setLoading(false);
        return;
      }

      router.push(safeRedirectPath(searchParams.get("redirect")));
      router.refresh();
    } catch {
      const serverErr = "Server is currently unavailable. Please try again later.";
      setLoginError(serverErr);
      toast.error(serverErr);
      setLoading(false);
    }
  }

  async function onPinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      const err = "PIN must be exactly 4 digits.";
      setLoginError(err);
      toast.error(err);
      return;
    }

    setLoading(true);
    setLoginError(null);

    try {
      const res = await signInWithPinAction({
        username: "Principal",
        pin,
      });

      if (res.success === false) {
        const err = res.error || "Invalid credentials. Please verify your login details.";
        setLoginError(err);
        toast.error(err);
        setLoading(false);
        return;
      }

      toast.success("Signed in successfully as Principal");
      router.push(safeRedirectPath(searchParams.get("redirect")));
      router.refresh();
    } catch {
      const serverErr = "Server is currently unavailable. Please try again later.";
      setLoginError(serverErr);
      toast.error(serverErr);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Login Mode Switcher */}
      <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200/80">
        <button
          type="button"
          onClick={() => { setMode("EMAIL"); setLoginError(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
            mode === "EMAIL"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Mail className="w-3.5 h-3.5" /> Email & Password
        </button>
        <button
          type="button"
          onClick={() => { setMode("PIN"); setLoginError(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
            mode === "PIN"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <KeyRound className="w-3.5 h-3.5 text-amber-600" /> Username & PIN
        </button>
      </div>

      {/* Inactive account warning or Error message */}
      {(isInactive || loginError) && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">
            {loginError || "Your account has been deactivated. Please contact the Principal."}
          </p>
        </div>
      )}

      {mode === "EMAIL" ? (
        /* Email & Password Form */
        <form onSubmit={onEmailSubmit} className="space-y-4">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              required
              className="w-full rounded-lg bg-slate-100 pl-10 pr-4 py-3 text-sm text-slate-700 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
            />
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg bg-slate-100 pl-10 pr-10 py-3 text-sm text-slate-700 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition"
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#1a1a2e] py-3 text-sm font-semibold text-white hover:bg-[#16213e] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>
      ) : (
        /* Username & PIN Form */
        <form onSubmit={onPinSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Username</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                type="text"
                value="Principal"
                readOnly
                disabled
                className="w-full rounded-lg bg-slate-200/70 pl-10 pr-4 py-3 text-sm font-bold text-slate-800 border border-slate-300 cursor-not-allowed select-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">4-Digit PIN</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
                <KeyRound className="h-[15px] w-[15px]" />
              </span>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                required
                autoFocus
                className="w-full rounded-lg bg-slate-100 pl-10 pr-4 py-3 text-lg tracking-[0.5em] font-mono font-bold text-slate-800 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition"
              />
            </div>
            <p className="text-[11px] text-slate-400 text-right">Enter your 4-digit PIN</p>
          </div>

          <button
            type="submit"
            disabled={loading || pin.length !== 4}
            className="w-full rounded-lg bg-[#1a1a2e] py-3 text-sm font-semibold text-white hover:bg-[#16213e] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
            {loading ? "Authenticating PIN…" : "Login with PIN"}
          </button>
        </form>
      )}
    </div>
  );
}

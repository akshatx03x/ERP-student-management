import { Suspense } from "react";
import { AuthShell } from "@/components/layout/auth-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell title="Login to your account" subtitle="">
      <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}

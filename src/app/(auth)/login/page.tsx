import { Suspense } from "react";
import { AuthShell } from "@/components/layout/auth-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in with your email to continue.">
      <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}

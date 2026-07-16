import { AuthShell } from "@/components/layout/auth-shell";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create account"
      subtitle="Register with any email to access the dashboard."
    >
      <RegisterForm />
    </AuthShell>
  );
}

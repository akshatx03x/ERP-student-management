export function safeRedirectPath(redirect: string | null | undefined): string {
  if (!redirect) return "/dashboard";
  if (!redirect.startsWith("/")) return "/dashboard";
  if (redirect.startsWith("//")) return "/dashboard";
  if (redirect.startsWith("/login") || redirect.startsWith("/register")) {
    return "/dashboard";
  }
  return redirect;
}

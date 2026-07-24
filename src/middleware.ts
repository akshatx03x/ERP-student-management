import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/change-password"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/api/health" ||
    pathname.startsWith("/api/auth") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  console.log(`[Middleware Diagnostic] Path: ${pathname} | origin: "${request.nextUrl.origin}" | host header: "${request.headers.get("host")}"`);

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    console.log(`[Middleware Redirect] Redirecting to: ${loginUrl.toString()}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

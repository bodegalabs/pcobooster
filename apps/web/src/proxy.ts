import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isPublicPath } from "@/lib/public-paths";

const isDevAuthBypassEnabled = (): boolean => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return (
    process.env.DEV_AUTH_BYPASS === "1" ||
    process.env.DEV_AUTH_BYPASS === "true"
  );
};

export const proxy = (request: NextRequest) => {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (isDevAuthBypassEnabled()) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (request.nextUrl.pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (
    request.nextUrl.pathname === "/api/rpc" ||
    request.nextUrl.pathname.startsWith("/api/rpc/")
  ) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === "/auth") {
    return NextResponse.next();
  }

  if (sessionCookie !== null && sessionCookie !== "") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/auth";
  return NextResponse.redirect(url);
};

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";

const log = logger.for("middleware");

function isDevAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return (
    process.env.DEV_AUTH_BYPASS === "1" ||
    process.env.DEV_AUTH_BYPASS === "true"
  );
}

export function proxy(request: NextRequest) {
  if (isDevAuthBypassEnabled()) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (request.nextUrl.pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === "/auth") {
    return NextResponse.next();
  }

  if (sessionCookie) {
    return NextResponse.next();
  }

  log.info(
    { path: request.nextUrl.pathname },
    "Redirecting unauthenticated request to /auth"
  );
  const url = request.nextUrl.clone();
  url.pathname = "/auth";
  return NextResponse.redirect(url);
}

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

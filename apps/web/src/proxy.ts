import { DEMO_SESSION_COOKIE } from "@pcobooster/contracts/demo";
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  DEFAULT_SIGN_IN_RETURN_PATH,
  SIGN_IN_RETURN_PARAM,
  sanitizeReturnPath,
} from "@/lib/auth-redirect";
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

const DEMO_ENTRY_PREFIX = "/demo/";

/** Presence only; the API verifies the demo token on every request. */
const hasDemoSessionCookie = (request: NextRequest): boolean =>
  (request.cookies.get(DEMO_SESSION_COOKIE)?.value ?? "") !== "";

export const proxy = (request: NextRequest) => {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith(DEMO_ENTRY_PREFIX)) {
    // A private link: keep it out of search indexes and referrer headers.
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
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

  if (
    (sessionCookie !== null && sessionCookie !== "") ||
    hasDemoSessionCookie(request)
  ) {
    return NextResponse.next();
  }

  const returnPath = sanitizeReturnPath(
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  const url = request.nextUrl.clone();
  url.pathname = "/auth";
  url.search = "";
  if (returnPath !== DEFAULT_SIGN_IN_RETURN_PATH) {
    url.searchParams.set(SIGN_IN_RETURN_PARAM, returnPath);
  }
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

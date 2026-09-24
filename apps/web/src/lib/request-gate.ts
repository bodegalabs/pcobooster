import {
  DEFAULT_SIGN_IN_RETURN_PATH,
  SIGN_IN_RETURN_PARAM,
  sanitizeReturnPath,
} from "@/lib/auth-redirect";
import { isPublicPath } from "@/lib/public-paths";

const WWW_HOSTNAME = "www.pcobooster.com";
const APEX_HOSTNAME = "pcobooster.com";
const DEMO_ENTRY_PREFIX = "/demo/";

/** A private demo link stays out of search indexes and referrer headers. */
const privateLinkHeaders = {
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
} as const satisfies ResponseHeaders;

/** Header name to value, set on the final response. */
export interface ResponseHeaders {
  readonly [name: string]: string;
}

export interface RequestGateInput {
  url: URL;
  /** Start's handler type: server functions authorize themselves through the API. */
  handlerType: "router" | "serverFn";
  /** Presence only; the API verifies the session on every request. */
  hasSessionCookie: boolean;
  /** Presence only; the API verifies the demo token on every request. */
  hasDemoSessionCookie: boolean;
  devAuthBypass: boolean;
}

export type RequestGateDecision =
  | { action: "redirect"; location: string; status: 307 | 308 }
  | {
      action: "continue";
      /** Set on the final response, including redirects and error pages. */
      responseHeaders: ResponseHeaders;
    };

const proceed = (
  responseHeaders: ResponseHeaders = {}
): RequestGateDecision => ({
  action: "continue",
  responseHeaders,
});

/** Sign-in and the API endpoints the signed-out browser needs stay reachable. */
const isSignedOutPath = (pathname: string): boolean =>
  pathname.startsWith("/api/auth") ||
  pathname === "/api/rpc" ||
  pathname.startsWith("/api/rpc/") ||
  pathname === "/auth";

const signInUrl = (url: URL): string => {
  const returnPath = sanitizeReturnPath(`${url.pathname}${url.search}`);
  const destination = new URL("/auth", url.origin);
  if (returnPath !== DEFAULT_SIGN_IN_RETURN_PATH) {
    destination.searchParams.set(SIGN_IN_RETURN_PARAM, returnPath);
  }
  return destination.toString();
};

/**
 * Decides what the product Worker does with a request before any HTML is rendered: send
 * `www` to the apex, serve public and sign-in paths, and redirect signed-out visitors to
 * sign-in with a sanitized return path. Cookie presence is a cheap gate for page loads; the
 * API Worker remains the authorization boundary for every data request.
 */
export const decideRequestGate = ({
  url,
  handlerType,
  hasSessionCookie,
  hasDemoSessionCookie,
  devAuthBypass,
}: RequestGateInput): RequestGateDecision => {
  if (url.hostname === WWW_HOSTNAME) {
    const canonical = new URL(url);
    canonical.hostname = APEX_HOSTNAME;
    canonical.protocol = "https:";
    return { action: "redirect", location: canonical.toString(), status: 308 };
  }
  if (isPublicPath(url.pathname)) {
    return proceed();
  }
  if (url.pathname.startsWith(DEMO_ENTRY_PREFIX)) {
    return proceed(privateLinkHeaders);
  }
  if (
    devAuthBypass ||
    handlerType === "serverFn" ||
    isSignedOutPath(url.pathname) ||
    hasSessionCookie ||
    hasDemoSessionCookie
  ) {
    return proceed();
  }
  return { action: "redirect", location: signInUrl(url), status: 307 };
};

/** Local development may skip sign-in; production builds never do. */
export const isDevAuthBypassEnabled = (
  value: string | undefined,
  production: boolean
): boolean => !production && (value === "1" || value === "true");

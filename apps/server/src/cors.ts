/**
 * The API Worker's one CORS policy: only the product origin, with credentials. The Worker's
 * router applies it to preflights and every route (`http-app.ts`).
 */
import { DEMO_SESSION_HEADER } from "@pcobooster/api/auth/demo-access";
import { PLANNING_CENTER_SELECTED_ACCOUNT_HEADER } from "@pcobooster/api/auth/planning-center-session";
import { CLIENT_HEADER } from "@pcobooster/contracts/http/client-version";
import { REQUEST_PRIORITY_HEADER } from "@pcobooster/contracts/request-priority";
import { SERVER_VERSION_HEADER } from "@pcobooster/contracts/rpc/procedure";

export interface CorsPolicy {
  readonly origin: string;
  readonly credentials: true;
  readonly allowMethods: string[];
  readonly allowHeaders: string[];
  readonly exposeHeaders: string[];
}

export const corsPolicy = (origin: string): CorsPolicy => ({
  origin,
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // Every HTTP header the product clients send: the native app adds its bearer token, account,
  // and demo headers, and every call says its priority.
  allowHeaders: [
    "Content-Type",
    "Authorization",
    CLIENT_HEADER,
    "x-request-id",
    PLANNING_CENTER_SELECTED_ACCOUNT_HEADER,
    DEMO_SESSION_HEADER,
    REQUEST_PRIORITY_HEADER,
  ],
  // What a browser on the product origin may read: when to retry, and which release answered.
  exposeHeaders: ["Retry-After", SERVER_VERSION_HEADER],
});

/**
 * The headers the router's CORS middleware puts on a response that is not a preflight, for the
 * RPC route: the origin only when it is the product's, credentials always, and `Vary: Origin`.
 */
export const corsResponseHeaders = (
  policy: CorsPolicy,
  requestOrigin: string | null
): Headers => {
  const headers = new Headers({
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  if (requestOrigin === policy.origin) {
    headers.set("access-control-allow-origin", policy.origin);
  }
  return headers;
};

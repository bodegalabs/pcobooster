/**
 * The API Worker's one CORS policy: only the product origin, with credentials. Hono applies it
 * to preflights and its own routes (`app.ts`); the RPC route, which Hono never sees, applies it
 * to every response it writes (`rpc-route.ts`).
 */
import { DEMO_SESSION_HEADER } from "@pcobooster/api/auth/demo-access";
import { PLANNING_CENTER_SELECTED_ACCOUNT_HEADER } from "@pcobooster/api/auth/planning-center-session";
import { RPC_HEADERS } from "@pcobooster/contracts/rpc/procedure";

export interface CorsPolicy {
  readonly origin: string;
  readonly credentials: true;
  readonly allowMethods: string[];
  readonly allowHeaders: string[];
}

export const corsPolicy = (origin: string): CorsPolicy => ({
  origin,
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  // Every HTTP header the product client sends: the native app adds its bearer token, account,
  // and demo headers; the RPC priority rides in the message, not here.
  allowHeaders: [
    "Content-Type",
    "Authorization",
    RPC_HEADERS.client,
    RPC_HEADERS.requestId,
    PLANNING_CENTER_SELECTED_ACCOUNT_HEADER,
    DEMO_SESSION_HEADER,
  ],
});

/**
 * The headers Hono's `cors` middleware puts on a response that is not a preflight, for the RPC
 * route: the origin only when it is the product's, credentials always, and `Vary: Origin`.
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

import { DEMO_SESSION_COOKIE } from "@pcobooster/contracts/demo";
import { createMiddleware } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { getSessionCookie } from "better-auth/cookies";
import { env } from "cloudflare:workers";

import { decideRequestGate, isDevAuthBypassEnabled } from "@/lib/request-gate";
import type { ResponseHeaders } from "@/lib/request-gate";

/**
 * Headers go on the final response: `setResponseHeaders` skips redirects and error pages,
 * which need them too. Start creates each of those responses, so their headers are mutable.
 */
const withResponseHeaders = <Result extends { response: Response }>(
  result: Result,
  headers: ResponseHeaders
): Result => {
  for (const [name, value] of Object.entries(headers)) {
    result.response.headers.set(name, value);
  }
  return result;
};

const isPresent = (value: string | null | undefined): boolean =>
  value !== null && value !== undefined && value !== "";

/**
 * Runs before any route, server route, or server function: `www` goes to the apex, and
 * signed-out visitors go to sign-in before any product HTML renders. Static assets never
 * reach the Worker.
 */
export const requestGateMiddleware = createMiddleware().server(
  async ({ request, handlerType, next }) => {
    const decision = decideRequestGate({
      url: new URL(request.url),
      handlerType,
      hasSessionCookie: isPresent(getSessionCookie(request)),
      hasDemoSessionCookie: isPresent(getCookie(DEMO_SESSION_COOKIE)),
      devAuthBypass: isDevAuthBypassEnabled(
        env.DEV_AUTH_BYPASS,
        import.meta.env.PROD
      ),
    });
    if (decision.action === "redirect") {
      return new Response(null, {
        status: decision.status,
        headers: { Location: decision.location },
      });
    }
    return withResponseHeaders(await next(), decision.responseHeaders);
  }
);

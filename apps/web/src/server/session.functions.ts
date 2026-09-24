import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getSessionCookie } from "better-auth/cookies";
import { env } from "cloudflare:workers";

import { createServerRpcClient } from "@/server/server-rpc";

/**
 * Whether the visitor's session is still valid. Signed-out visitors have no session cookie,
 * so they skip the API round trip.
 */
export const getSessionStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { headers } = getRequest();
    if (getSessionCookie(headers) === null) {
      return { authenticated: false };
    }
    const client = createServerRpcClient({
      api: env.API,
      cookie: headers.get("cookie") ?? undefined,
      productOrigin: env.PRODUCT_ORIGIN,
    });
    return await client.session.status({});
  }
);

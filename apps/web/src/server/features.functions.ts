import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import { createServerRpcClient } from "@/server/server-rpc";

/**
 * Whether the People pages are on for this visitor. The API evaluates the `people` flag for
 * the signed-in user and organization on every call.
 */
export const getPeopleFeature = createServerFn({ method: "GET" }).handler(
  async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const client = createServerRpcClient({
      api: env.API,
      cookie: getRequest().headers.get("cookie") ?? undefined,
      productOrigin: env.PRODUCT_ORIGIN,
    });
    return await client.features.people({});
  }
);

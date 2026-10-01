import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import { createServerRpcClient } from "@/server/server-rpc";

const createRequestRpcClient = () => {
  setResponseHeader("Cache-Control", "private, no-store");
  return createServerRpcClient({
    api: env.API,
    cookie: getRequest().headers.get("cookie") ?? undefined,
    productOrigin: env.PRODUCT_ORIGIN,
  });
};

/**
 * Whether each flag is on for this visitor. The API evaluates every flag for the signed-in user
 * and organization on each call.
 */
export const getEnabledFeatures = createServerFn({ method: "GET" }).handler(
  async () => await createRequestRpcClient().features.status()
);

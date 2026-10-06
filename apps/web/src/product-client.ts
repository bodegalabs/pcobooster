import { captureAnalytics } from "@pcobooster/analytics/client";
import { makeProductClient } from "@pcobooster/client/product-client";
import type { ProductClient } from "@pcobooster/client/product-client";

import { requestScheduler } from "@/lib/request-priority";
import { measureWorkflow } from "@/lib/workflow-analytics";

let tabClient: ProductClient | undefined;

/**
 * The tab's one RPC client, built on first call: route modules also load during SSR, where
 * there is no `window` and SSR has its own client (`server/server-rpc.ts`).
 */
const sharedClient = (): ProductClient => {
  tabClient ??= makeProductClient({
    url: new URL("/api/rpc", window.location.origin).href,
    client: "web",
    credentials: "include",
  });
  return tabClient;
};

/**
 * Every browser call to the API. Interactive calls hold speculative work back until they
 * settle, and writes are measured for workflow analytics.
 */
export const productClient: Pick<ProductClient, "call"> = {
  call: async (tag, ...args) =>
    await requestScheduler.track(
      args[1]?.priority ?? "interactive",
      async () =>
        await measureWorkflow(
          tag,
          async () => await sharedClient().call(tag, ...args),
          captureAnalytics
        )
    ),
};

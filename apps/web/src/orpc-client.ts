import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { appContract } from "@pcobooster/contracts";

type AppClient = ContractRouterClient<typeof appContract>;

const rpcLink = new RPCLink({
  fetch: async (request) =>
    await globalThis.fetch(new Request(request, { credentials: "include" })),
  // oRPC builds each request with `new URL(url)`, which requires an origin.
  url: () => new URL("/api/rpc", window.location.origin).href,
});

export const orpc = createORPCClient<AppClient>(rpcLink);

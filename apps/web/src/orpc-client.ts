import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { appContract } from "@worship-admin/contracts";

type AppClient = ContractRouterClient<typeof appContract>;

const rpcLink = new RPCLink({
  fetch: async (request) =>
    await globalThis.fetch(new Request(request, { credentials: "include" })),
  url: "/api/rpc",
});

export const orpc = createORPCClient<AppClient>(rpcLink);

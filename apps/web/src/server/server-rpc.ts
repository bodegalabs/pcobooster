import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { appContract } from "@pcobooster/contracts";
import { notFound, redirect } from "@tanstack/react-router";

type AppClient = ContractRouterClient<typeof appContract>;

/** A Worker service binding, or a test double. */
export interface ServiceFetcher {
  fetch: (request: Request) => Promise<Response>;
}

export interface ServerRpcOptions {
  api: ServiceFetcher;
  /** Incoming `Cookie` header; the session cookie authorizes the API call. */
  cookie: string | undefined;
  /** RPC URLs use the product origin the API expects, not the binding's. */
  productOrigin: string;
}

/**
 * oRPC client for server-side calls through the API binding. Authorization failures become
 * navigation: signed-out requests go to sign-in, and forbidden or missing data renders the
 * not-found page.
 */
export const createServerRpcClient = ({
  api,
  cookie,
  productOrigin,
}: ServerRpcOptions): AppClient => {
  const headers = new Headers();
  if (cookie !== undefined && cookie !== "") {
    headers.set("cookie", cookie);
  }

  const rpcLink = new RPCLink({
    headers,
    url: `${productOrigin}/api/rpc`,
    fetch: async (request) => {
      const response = await api.fetch(
        new Request(request, { redirect: "manual" })
      );
      if (response.status === 401) {
        redirect({ to: "/auth", throw: true });
      }
      if (response.status === 403 || response.status === 404) {
        notFound({ throw: true });
      }
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      return response;
    },
  });
  return createORPCClient<AppClient>(rpcLink);
};

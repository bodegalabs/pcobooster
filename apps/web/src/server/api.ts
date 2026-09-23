import "server-only";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { appContract } from "@pcobooster/contracts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getWorkerEnvironment } from "@/lib/cloudflare";

type AppClient = ContractRouterClient<typeof appContract>;

interface ServerApiDependencies {
  incomingHeaders: Headers;
  productOrigin: string;
  api: { fetch: (url: string, init?: RequestInit) => Promise<Response> };
}

export const createServerRpcClient = ({
  incomingHeaders,
  productOrigin,
  api,
}: ServerApiDependencies): AppClient => {
  const forwardedHeaders = new Headers();
  const cookie = incomingHeaders.get("cookie");
  if (cookie !== null && cookie !== "") {
    forwardedHeaders.set("cookie", cookie);
  }

  const rpcLink = new RPCLink({
    headers: forwardedHeaders,
    url: `${productOrigin}/api/rpc`,
    fetch: async (request) => {
      const outgoing = new Request(request, { cache: "no-store" });
      const response = await api.fetch(outgoing.url, {
        method: outgoing.method,
        headers: Object.fromEntries(outgoing.headers),
        body:
          outgoing.method === "GET" || outgoing.method === "HEAD"
            ? undefined
            : await outgoing.arrayBuffer(),
        cache: "no-store",
        redirect: "manual",
        signal: request.signal,
      });
      if (response.status === 401) {
        redirect("/auth");
      }
      if (response.status === 403 || response.status === 404) {
        notFound();
      }
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      return response;
    },
  });
  return createORPCClient<AppClient>(rpcLink);
};

export const getSessionStatus = async () => {
  const environment =
    process.env.NODE_ENV === "production" ? getWorkerEnvironment() : null;
  const client = createServerRpcClient({
    incomingHeaders: await headers(),
    productOrigin: environment?.PRODUCT_ORIGIN ?? "http://127.0.0.1:3001",
    api: environment?.API ?? {
      fetch: async (url, init) => await fetch(url, init),
    },
  });
  return await client.session.status({});
};

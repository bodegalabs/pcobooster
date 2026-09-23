import "server-only";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { appContract } from "@pcobooster/contracts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getWorkerEnvironment } from "@/lib/cloudflare";

type AppClient = ContractRouterClient<typeof appContract>;

/**
 * The product app owns sign-in and the API. In production its session cookie
 * is scoped to the parent domain, so this subdomain forwards it unchanged.
 */
const getProductOrigin = (): string =>
  process.env.NODE_ENV === "production"
    ? getWorkerEnvironment().PRODUCT_ORIGIN
    : "http://127.0.0.1:3001";

const createServerRpcClient = async (): Promise<AppClient> => {
  const productOrigin = getProductOrigin();
  const incomingHeaders = await headers();
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
      const response =
        process.env.NODE_ENV === "production"
          ? await getWorkerEnvironment().API.fetch(outgoing.url, {
              method: outgoing.method,
              headers: Object.fromEntries(outgoing.headers),
              body:
                outgoing.method === "GET" || outgoing.method === "HEAD"
                  ? undefined
                  : await outgoing.arrayBuffer(),
              redirect: "manual",
              signal: request.signal,
            })
          : await fetch(outgoing);
      if (response.status === 401) {
        const destination = new URL("/auth", productOrigin);
        if (
          process.env.NODE_ENV === "development" ||
          process.env.ADMIN_BASE_PATH === "/admin"
        ) {
          destination.searchParams.set("next", "/admin");
        }
        redirect(destination.toString());
      }
      // Hide the app's existence from signed-in accounts outside the allowlist.
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

export const getAdminAccounts = async () => {
  const client = await createServerRpcClient();
  return await client.admin.accounts({});
};

export const getAdminUser = async (userId: string) => {
  const client = await createServerRpcClient();
  return await client.admin.user({ userId });
};

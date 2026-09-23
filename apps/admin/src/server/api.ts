import "server-only";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { appContract } from "@pcobooster/contracts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

type AppClient = ContractRouterClient<typeof appContract>;

/**
 * The product app owns sign-in and the API. In production its session cookie
 * is scoped to the parent domain, so this subdomain forwards it unchanged.
 */
const PRODUCT_ORIGIN =
  process.env.NODE_ENV === "production"
    ? "https://pcobooster.com"
    : "http://127.0.0.1:3001";

const createServerRpcClient = async (): Promise<AppClient> => {
  const incomingHeaders = await headers();
  const forwardedHeaders = new Headers();
  const cookie = incomingHeaders.get("cookie");
  if (cookie !== null && cookie !== "") {
    forwardedHeaders.set("cookie", cookie);
  }

  const rpcLink = new RPCLink({
    headers: forwardedHeaders,
    url: `${PRODUCT_ORIGIN}/api/rpc`,
    fetch: async (request) => {
      const response = await fetch(new Request(request, { cache: "no-store" }));
      if (response.status === 401) {
        redirect(`${PRODUCT_ORIGIN}/auth`);
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

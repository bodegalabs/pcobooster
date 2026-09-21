import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { appContract } from "@worship-admin/contracts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

type AppClient = ContractRouterClient<typeof appContract>;

const firstForwardedValue = (value: string | null): string | null => {
  const first = value?.split(",", 1)[0]?.trim() ?? null;
  return first !== null && first !== "" ? first : null;
};

const createServerRpcClient = async (): Promise<AppClient> => {
  const incomingHeaders = await headers();
  const host =
    firstForwardedValue(incomingHeaders.get("x-forwarded-host")) ??
    incomingHeaders.get("host");
  if (host === null || host === "") {
    throw new Error("Unable to resolve the web request host");
  }

  const protocol =
    firstForwardedValue(incomingHeaders.get("x-forwarded-proto")) ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  const forwardedHeaders = new Headers();
  const cookie = incomingHeaders.get("cookie");
  if (cookie !== null && cookie !== "") {
    forwardedHeaders.set("cookie", cookie);
  }

  const rpcLink = new RPCLink({
    headers: forwardedHeaders,
    url: `${protocol}://${host}/api/rpc`,
    fetch: async (request) => {
      const response = await fetch(new Request(request, { cache: "no-store" }));
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
  const client = await createServerRpcClient();
  return await client.session.status({});
};

export const getAdminAccounts = async () => {
  const client = await createServerRpcClient();
  return await client.admin.accounts({});
};

export const getAdminUser = async (userId: string) => {
  const client = await createServerRpcClient();
  return await client.admin.user({ userId });
};

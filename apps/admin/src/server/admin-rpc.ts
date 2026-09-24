import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { appContract } from "@pcobooster/contracts";
import { notFound, redirect } from "@tanstack/react-router";

// Relative: the root Vitest config maps `@/` to the web app.
import { productSignInUrl } from "../lib/base-path";

export type AppClient = ContractRouterClient<typeof appContract>;

/** The API Worker service binding, or a test double. */
export interface ApiFetcher {
  fetch: (request: Request) => Promise<Response>;
}

export interface AdminRpcOptions {
  api: ApiFetcher;
  /** Vite base the admin app is served under (`/admin/` or `/`). */
  adminBase: string;
  /** Incoming `Cookie` header; the product session cookie authorizes the API call. */
  cookie: string | undefined;
  /** The product owns sign-in and the API, so RPC URLs use its origin. */
  productOrigin: string;
}

/**
 * Sends one RPC request through the API binding and maps authorization failures to
 * navigation: signed-out requests go to product sign-in, and accounts outside the
 * allowlist get a 404 so the app's existence stays hidden.
 */
export const sendAdminRpc = async (
  options: Pick<AdminRpcOptions, "adminBase" | "api" | "productOrigin">,
  request: Request
): Promise<Response> => {
  const response = await options.api.fetch(
    new Request(request, { redirect: "manual" })
  );
  if (response.status === 401) {
    // Sign-in is a product page. Under the product's `/admin` route both share an origin,
    // so without a document load the router would resolve `/auth` inside the admin basepath.
    redirect({
      href: productSignInUrl(options.productOrigin, options.adminBase),
      reloadDocument: true,
      throw: true,
    });
  }
  if (response.status === 403 || response.status === 404) {
    notFound({ throw: true });
  }
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return response;
};

export const createAdminRpcClient = (options: AdminRpcOptions): AppClient => {
  const headers = new Headers();
  if (options.cookie !== undefined && options.cookie !== "") {
    headers.set("cookie", options.cookie);
  }
  const link = new RPCLink({
    headers,
    url: `${options.productOrigin}/api/rpc`,
    fetch: async (request) => await sendAdminRpc(options, request),
  });
  return createORPCClient<AppClient>(link);
};

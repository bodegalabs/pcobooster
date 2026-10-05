import { createRpcClient } from "@pcobooster/client/rpc";
import { RpcError } from "@pcobooster/contracts/errors";
import { notFound, redirect } from "@tanstack/react-router";

/** A Worker service binding, or a test double. */
export interface ServiceFetcher {
  fetch: (request: Request) => Promise<Response>;
}
export interface ServerRpcOptions {
  api: ServiceFetcher;
  cookie: string | undefined;
  productOrigin: string;
}

/** Scoped HTTP RPC calls through the private binding, preserving the product origin. */
export const createServerRpcClient = ({
  api,
  cookie,
  productOrigin,
}: ServerRpcOptions) =>
  createRpcClient({
    url: () => `${productOrigin}/api/rpc`,
    headers: () => {
      const headers = new Headers();
      if (cookie !== undefined && cookie !== "") {
        headers.set("cookie", cookie);
      }
      return headers;
    },
    fetch: async (url, init) =>
      await api.fetch(new Request(url, { ...init, redirect: "manual" })),
    onResponse: (response) => {
      if (response.status === 401) {
        redirect({ to: "/auth", throw: true });
      }
      if (response.status === 403 || response.status === 404) {
        notFound({ throw: true });
      }
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
    },
    onError: (error) => {
      if (!(error instanceof RpcError)) {
        return;
      }
      if (error.code === "UNAUTHORIZED") {
        redirect({ to: "/auth", throw: true });
      }
      if (error.code === "FORBIDDEN" || error.code === "NOT_FOUND") {
        notFound({ throw: true });
      }
    },
  });

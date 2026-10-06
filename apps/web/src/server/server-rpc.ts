import {
  failureStatus,
  makeProductClient,
} from "@pcobooster/client/product-client";
import type {
  CallArguments,
  ProcedureOutput,
} from "@pcobooster/client/product-client";
import type { ProcedureTag } from "@pcobooster/contracts/rpc/product";
import { notFound, redirect } from "@tanstack/react-router";

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

const UNAUTHENTICATED_STATUS = 401;
const FORBIDDEN_STATUS = 403;
const NOT_FOUND_STATUS = 404;

/**
 * Signed-out requests go to sign-in; forbidden or missing data renders the not-found page.
 * Throws the navigation; returns for any other failure.
 */
const navigateOnFault = (failure: Error): void => {
  const status = failureStatus(failure);
  if (status === UNAUTHENTICATED_STATUS) {
    redirect({ to: "/auth", throw: true });
  }
  if (status === FORBIDDEN_STATUS || status === NOT_FOUND_STATUS) {
    notFound({ throw: true });
  }
};

/**
 * One product call from SSR, through the API service binding. Each call gets its own client,
 * disposed when it settles, so one render request's cookie never reaches another's. The
 * cookie travels as an HTTP header, the only place the API reads identity from.
 */
export const serverCall = async <Tag extends ProcedureTag>(
  { api, cookie, productOrigin }: ServerRpcOptions,
  tag: Tag,
  ...args: CallArguments<Tag>
): Promise<ProcedureOutput<Tag>> => {
  const client = makeProductClient({
    url: `${productOrigin}/api/rpc`,
    client: "ssr",
    fetch: async (input, init) =>
      await api.fetch(new Request(input, { ...init, redirect: "manual" })),
    httpHeaders: (): HeadersInit =>
      cookie === undefined || cookie === "" ? [] : [["cookie", cookie]],
  });
  try {
    return await client.call(tag, ...args);
  } catch (error) {
    if (error instanceof Error) {
      navigateOnFault(error);
    }
    throw error;
  } finally {
    await client.dispose();
  }
};

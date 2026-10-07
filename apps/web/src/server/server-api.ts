import {
  failureStatus,
  makeProductClient,
} from "@pcobooster/client/product-client";
import type { ProductApi } from "@pcobooster/client/product-client";
import { notFound, redirect } from "@tanstack/react-router";
import type { Effect } from "effect";

/** A Worker service binding, or a test double. */
export interface ServiceFetcher {
  fetch: (request: Request) => Promise<Response>;
}

export interface ServerApiOptions {
  api: ServiceFetcher;
  /** Incoming `Cookie` header; the session cookie authorizes the API call. */
  cookie: string | undefined;
  /** Calls use the product origin the API expects, not the binding's. */
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
 * One product call from SSR, through the API service binding:
 * `serverCall(options, (api) => api.session.status())`. Each call gets its own client, so one
 * render request's cookie never reaches another's. The cookie travels as an HTTP header, the
 * only place the API reads identity from.
 */
export const serverCall = async <Value, Failure>(
  { api, cookie, productOrigin }: ServerApiOptions,
  call: (client: ProductApi) => Effect.Effect<Value, Failure>
): Promise<Value> => {
  const client = makeProductClient({
    url: productOrigin,
    client: "ssr",
    fetch: async (input, init) =>
      await api.fetch(new Request(input, { ...init, redirect: "manual" })),
    httpHeaders: (): HeadersInit =>
      cookie === undefined || cookie === "" ? [] : [["cookie", cookie]],
  });
  try {
    return await client.run(call);
  } catch (error) {
    if (error instanceof Error) {
      navigateOnFault(error);
    }
    throw error;
  }
};

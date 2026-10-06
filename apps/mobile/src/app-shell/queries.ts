import { TransportFailure } from "@pcobooster/client/product-client";
import { callForQuery } from "@pcobooster/client/query";
import type { RequestScheduler } from "@pcobooster/client/request-scheduler";
import { isProductFault } from "@pcobooster/contracts/faults";
import { queryOptions } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { SignInFailure } from "../session/native-sign-in";
import { DemoLinkFailureError } from "./app-client";
import type { AppClient } from "./app-client";

export interface ProductClientContextValue {
  readonly client: AppClient;
  /** Speculative work (warm-ups, prefetches) waits behind what the person is waiting on. */
  readonly scheduler: RequestScheduler;
  /** The account context queries belong to, so nothing is shared across accounts. */
  readonly scope: string;
}

export const ProductClientContext =
  createContext<ProductClientContextValue | null>(null);

export const useProductClient = (): ProductClientContextValue => {
  const value = useContext(ProductClientContext);
  if (value === null) {
    throw new Error("useProductClient needs an AppProviders above it");
  }
  return value;
};

/** Permissions change rarely (the web keeps them 10 minutes). */
const ACCESS_STALE_MS = 600_000;

/** Query options for the reads every screen shares, keyed by account scope. */
export const sharedReads = {
  organization: ({ client, scope }: ProductClientContextValue) =>
    queryOptions({
      queryKey: [scope, "catalog.organization"] as const,
      queryFn: async (context) =>
        await callForQuery(context, client, (api) =>
          api.catalog.organization()
        ),
      staleTime: Number.POSITIVE_INFINITY,
    }),
  features: ({ client, scope }: ProductClientContextValue) =>
    queryOptions({
      queryKey: [scope, "features.status"] as const,
      queryFn: async (context) =>
        await callForQuery(context, client, (api) => api.features.status()),
    }),
  accounts: ({ client, scope }: ProductClientContextValue) =>
    queryOptions({
      queryKey: [scope, "accounts.list"] as const,
      queryFn: async (context) =>
        await callForQuery(context, client, (api) => api.accounts.list()),
    }),
  /** `access.me`: what this person's Planning Center permissions allow. */
  access: ({ client, scope }: ProductClientContextValue) =>
    queryOptions({
      queryKey: [scope, "access.me"] as const,
      queryFn: async (context) =>
        await callForQuery(context, client, (api) => api.access.me()),
      staleTime: ACCESS_STALE_MS,
    }),
};

/** What a failure shows: a message written for people, or a calm generic line. */
export const failureMessage = (error: Error): string => {
  if (
    isProductFault(error) ||
    error instanceof SignInFailure ||
    error instanceof DemoLinkFailureError
  ) {
    return error.message;
  }
  if (error instanceof TransportFailure) {
    return error.reason === "network"
      ? "Couldn't reach pcobooster.com. Check your connection."
      : "pcobooster.com sent an answer this app couldn't read.";
  }
  return "Something went wrong.";
};

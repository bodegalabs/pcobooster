import { TransportFailure } from "@pcobooster/client/product-client";
import type { ProductClient } from "@pcobooster/client/product-client";
import { callForQuery } from "@pcobooster/client/query";
import { isProductFault } from "@pcobooster/contracts/faults";
import { queryOptions } from "@tanstack/react-query";
import { createContext, useContext } from "react";

export interface ProductClientContextValue {
  readonly client: ProductClient;
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
};

/** What a failed read shows: the fault's own message, or a network line. */
export const failureMessage = (error: Error): string => {
  if (isProductFault(error)) {
    return error.message;
  }
  if (error instanceof TransportFailure) {
    return error.reason === "network"
      ? "Couldn't reach pcobooster.com. Check your connection."
      : "pcobooster.com sent an answer this app couldn't read.";
  }
  return "Something went wrong.";
};

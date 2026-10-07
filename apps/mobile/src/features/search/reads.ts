import { callForQuery } from "@pcobooster/client/query";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Option, Schema } from "effect";

import { searchRecentSchema } from "../../app-shell/local-query-data";
import type { ProductClientContextValue } from "../../app-shell/queries";
import { addRecentItem, recentIdentity } from "./model";
import type { SearchRecent } from "./model";

export const searchReads = {
  serviceTypes: ({ client, scope }: ProductClientContextValue) =>
    queryOptions({
      queryKey: [scope, "catalog.serviceTypes"] as const,
      queryFn: async (context) =>
        await callForQuery(context, client, (api) =>
          api.catalog.serviceTypes()
        ),
      staleTime: 600_000,
    }),
  plans: (
    { client, scope }: ProductClientContextValue,
    serviceTypeId: string
  ) =>
    queryOptions({
      queryKey: [scope, "catalog.plans", serviceTypeId] as const,
      queryFn: async (context) =>
        await callForQuery(context, client, (api) =>
          api.catalog.plans({ params: { serviceTypeId } })
        ),
    }),
  people: ({ client, scope }: ProductClientContextValue, query: string) =>
    queryOptions({
      queryKey: [scope, "search.people", query] as const,
      queryFn: async (context) =>
        await callForQuery(context, client, (api) =>
          api.people.search({ query: { query } })
        ),
    }),
  songs: ({ client, scope }: ProductClientContextValue, query: string) =>
    queryOptions({
      queryKey: [scope, "search.songs", query] as const,
      queryFn: async (context) =>
        await callForQuery(context, client, (api) =>
          api.songs.search({ query: { query } })
        ),
    }),
};

export const searchRecentsQuery = (scope: string) => {
  const queryKey = [scope, "search.recent"] as const;
  return queryOptions({
    queryKey,
    queryFn: ({ client }): SearchRecent[] =>
      client.getQueryData<SearchRecent[]>(queryKey) ?? [],
    staleTime: Infinity,
  });
};
export const rememberSearchItem = (
  cache: QueryClient,
  scope: string,
  item: SearchRecent
): void => {
  const decoded = Schema.decodeUnknownOption(searchRecentSchema)(item);
  if (Option.isNone(decoded)) {
    return;
  }
  const key = searchRecentsQuery(scope).queryKey;
  cache.setQueryData<SearchRecent[]>(key, (current) =>
    addRecentItem(current ?? [], decoded.value)
  );
};

export const removeSearchItem = (
  cache: QueryClient,
  scope: string,
  item: SearchRecent
): void => {
  cache.setQueryData<SearchRecent[]>(
    searchRecentsQuery(scope).queryKey,
    (current) =>
      (current ?? []).filter(
        (candidate) => recentIdentity(candidate) !== recentIdentity(item)
      )
  );
};

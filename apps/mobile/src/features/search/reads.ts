import { callForQuery } from "@pcobooster/client/query";
import { queryOptions } from "@tanstack/react-query";

import type { ProductClientContextValue } from "../../app-shell/queries";

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

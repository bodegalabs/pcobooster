import { callForQuery } from "@pcobooster/client/query";
import { queryOptions } from "@tanstack/react-query";

import type { PlanReadContext } from "../reads";

export const songReads = {
  options: (
    { client, scope }: PlanReadContext,
    serviceTypeId: string,
    songId: string
  ) =>
    queryOptions({
      queryKey: [scope, "songs.options", serviceTypeId, songId],
      queryFn: async (context) => {
        const targetClientNative1 = client;
        const inputNative1 = { serviceTypeId, songId };
        return await callForQuery(context, targetClientNative1, (api) =>
          api.songs.options({ params: inputNative1 })
        );
      },
      staleTime: 600_000,
    }),
  search: ({ client, scope }: PlanReadContext, query: string) =>
    queryOptions({
      queryKey: [scope, "songs.search", query],
      queryFn: async (context) => {
        const targetClientNative2 = client;
        const inputNative2 = { query };
        return await callForQuery(context, targetClientNative2, (api) =>
          api.songs.search({ query: inputNative2 })
        );
      },
      staleTime: 60_000,
    }),
  history: ({ client, scope }: PlanReadContext, songId: string) =>
    queryOptions({
      queryKey: [scope, "songs.history", songId],
      queryFn: async (context) => {
        const targetClientNative3 = client;
        const inputNative3 = { songId };
        return await callForQuery(context, targetClientNative3, (api) =>
          api.songs.history({ params: inputNative3 })
        );
      },
      staleTime: 60_000,
    }),
};

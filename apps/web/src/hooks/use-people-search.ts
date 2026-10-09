import type { PeopleSearchResult } from "@pcobooster/contracts/http/people-schemas";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  normalizePeopleSearchQuery,
  readCachedPeopleSearch,
  writeCachedPeopleSearch,
} from "@/lib/people-search-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { productClient } from "@/product-client";

export type { PeopleSearchResult } from "@pcobooster/contracts/http/people-schemas";

export const usePeopleSearch = (query: string) => {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  const queryKey = queryKeys.peopleSearch(normalizedQuery);
  const readCachedResults = useCallback(
    () => readCachedPeopleSearch(normalizedQuery),
    [normalizedQuery]
  );
  useHydrateQueryFromCache(queryKey, readCachedResults);

  return useQuery<PeopleSearchResult[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const results = await productClient.run(
        (api) => api.people.search({ query: { query: normalizedQuery } }),
        { signal }
      );
      writeCachedPeopleSearch(normalizedQuery, results);
      return results;
    },
    enabled: normalizedQuery.length >= 2,
    placeholderData: (previousPeople) => previousPeople,
    staleTime: 30_000,
  });
};

"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getJson } from "@/lib/http/client";
import {
  normalizePeopleSearchQuery,
  readCachedPeopleSearch,
  writeCachedPeopleSearch,
} from "@/lib/people-search-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import type { PeopleSearchResult } from "@/lib/use-cases/planning-center/search-people";
export type { PeopleSearchResult } from "@/lib/use-cases/planning-center/search-people";

export function usePeopleSearch(query: string) {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  const queryKey = queryKeys.peopleSearch(normalizedQuery);
  const readCachedResults = useCallback(
    () => readCachedPeopleSearch(normalizedQuery),
    [normalizedQuery]
  );
  useHydrateQueryFromCache(queryKey, readCachedResults);

  return useQuery<PeopleSearchResult[]>({
    queryKey,
    queryFn: async () => {
      const results = await getJson<PeopleSearchResult[]>(
        `/api/people/search?q=${encodeURIComponent(normalizedQuery)}`
      );
      writeCachedPeopleSearch(normalizedQuery, results);
      return results;
    },
    enabled: normalizedQuery.length >= 2,
    placeholderData: (previousPeople) => previousPeople,
    staleTime: 30_000,
  });
}

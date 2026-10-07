import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import type { PeoplePreferences } from "../../app-shell/local-query-data";
import { teamScope } from "./dashboard";
import type { PeopleScope } from "./dashboard";

const defaults: PeoplePreferences = { scope: null, view: "list" };
export const peoplePreferencesQuery = (scope: string) => {
  const queryKey = [scope, "people.preferences"] as const;
  return queryOptions({
    queryKey,
    staleTime: Infinity,
    queryFn: ({ client }): PeoplePreferences =>
      client.getQueryData<PeoplePreferences>(queryKey) ?? defaults,
  });
};
export const savedPeopleScope = (value: string | null): PeopleScope | null => {
  if (value === "mine" || value === "all") {
    return value;
  }
  return value?.startsWith("team:") === true ? teamScope(value.slice(5)) : null;
};
export const savePeoplePreferences = (
  cache: QueryClient,
  scope: string,
  change: Partial<PeoplePreferences>
): void => {
  cache.setQueryData<PeoplePreferences>(
    peoplePreferencesQuery(scope).queryKey,
    (current) => ({ ...(current ?? defaults), ...change })
  );
};

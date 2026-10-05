import { isValidProductQueryData } from "@pcobooster/client/query-data-validation";
import { dehydrate } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Schema } from "effect";

import { serviceFiltersSchema } from "./features/service-filters";

export const isValidNativeQueryData = (
  key: readonly unknown[],
  data: typeof Schema.Unknown.Type
): boolean => {
  if (key[0] === "native" && key[1] === "services-preferences") {
    return Schema.is(serviceFiltersSchema)(data);
  }
  if (key[0] === "native" && key[1] === "people-scope") {
    return Schema.is(Schema.String)(data);
  }
  return isValidProductQueryData(key, data);
};

/** Progressive setQueryData exposes pages while fetching; only a completed read is fresh on disk. */
export const dehydrateSettledQueries = (client: QueryClient) =>
  dehydrate(client, {
    shouldDehydrateQuery: (query) =>
      query.state.status === "success" &&
      query.state.fetchStatus === "idle" &&
      isValidNativeQueryData(query.queryKey, query.state.data),
  });

import { queryKeys } from "@pcobooster/client/query-keys";
import type { PeopleDashboardActivityBatch } from "@pcobooster/contracts/people-schemas";
import type { QueryClient } from "@tanstack/react-query";

import { assertActive, readBatches, readProgressively } from "./progressive";

type Activity = PeopleDashboardActivityBatch["people"];

/** Completed sixteen-person batches survive scope expansion; search batches are supplied first. */
export const loadDashboardActivity = async ({
  client,
  batches,
  signal,
  read,
  publish,
  now = Date.now,
}: {
  client: QueryClient;
  batches: readonly string[][];
  signal: AbortSignal;
  read: (ids: string[]) => Promise<PeopleDashboardActivityBatch>;
  publish: (people: Activity) => void;
  now?: () => number;
}): Promise<Activity> => {
  const result: Activity = [];
  const expose = (people: Activity): void => {
    result.push(...people);
    publish([...result]);
  };
  await readBatches({
    inputs: batches,
    signal,
    read: async (initial) => {
      const key = queryKeys.peopleDashboardActivity(initial);
      const cached = client.getQueryState<Activity>(key);
      if (
        cached?.status === "success" &&
        cached.fetchStatus === "idle" &&
        !cached.isInvalidated &&
        now() - cached.dataUpdatedAt < 60_000 &&
        cached.data !== undefined
      ) {
        expose(cached.data);
        return;
      }
      const complete: Activity = [];
      await readProgressively({
        initial,
        signal,
        read,
        publish: (batch) => {
          complete.push(...batch.people);
          expose(batch.people);
        },
        continuation: (remaining, batch) => {
          if (
            batch.people.length === 0 &&
            batch.deferredPersonIds.length >= remaining.length
          ) {
            throw new Error(
              "Activity loading stopped making progress. Please retry."
            );
          }
          return batch.deferredPersonIds.length === 0
            ? null
            : batch.deferredPersonIds;
        },
      });
      assertActive(signal);
      client.setQueryData(key, complete);
    },
  });
  return result;
};

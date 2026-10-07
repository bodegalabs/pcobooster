import { PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE } from "@pcobooster/contracts/people";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useFeatures } from "../../app-shell/features";
import { failureMessage, useProductClient } from "../../app-shell/queries";
import {
  useVisibleQuery,
  useVisibleQueries,
  useReadVisibility,
} from "../../app-shell/visible-queries";
import { useClock, useOrgTimeZone } from "../../lib/environment";
import {
  assembleDashboard,
  chunkPersonIds,
  describeScope,
  effectiveScope,
  matchesQuery,
  normalizeQuery,
  orderActivityBatches,
  PEOPLE_DASHBOARD_BATCH_CONCURRENCY,
  PEOPLE_DASHBOARD_SAMPLE_SIZE,
  planBatches,
  resolveScopePersonIds,
  sampleSize,
  SEARCH_LOAD_DELAY_MS,
  unrequestedMatchIds,
} from "./dashboard";
import type { PeopleScope, RosterSort } from "./dashboard";
import { runInTurns } from "./in-turns";
import {
  peoplePreferencesQuery,
  savedPeopleScope,
  savePeoplePreferences,
} from "./preferences";
import { peopleKeys, peopleReads } from "./reads";
import { computeTeamHealth } from "./team-health";
import type { PersonSignal } from "./team-health";

const NO_BATCHES: readonly (readonly string[])[] = [];

/** What the People list shows: everyone, or only people with a signal to act on. */
export type PeopleShow = "everyone" | "attention";
export type PeopleView = "list" | "month";

interface SearchLoad {
  readonly scope: PeopleScope;
  /** The settled query these batches were planned for. */
  readonly query: string;
  /** Activity calls for search matches outside the sample, in the order they were asked. */
  readonly batches: readonly (readonly string[])[];
}

/** The value once it has stopped changing for `delayMs`; clearing applies at once. */
const useSettledValue = (value: string, delayMs: number): string => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(
      () => {
        setSettled(value);
      },
      value === "" ? 0 : delayMs
    );
    return () => {
      clearTimeout(timer);
    };
  }, [delayMs, value]);
  return settled;
};

const activityState = (
  cache: QueryClient,
  scope: string,
  personIds: readonly string[]
) => cache.getQueryState(peopleKeys.activity(scope, personIds));

/** Loaded or failed, and not fetching. */
const isSettled = (
  cache: QueryClient,
  scope: string,
  personIds: readonly string[]
): boolean => {
  const state = activityState(cache, scope, personIds);
  return (
    state !== undefined &&
    state.status !== "pending" &&
    state.fetchStatus !== "fetching"
  );
};

/** Answered once (or restored from disk), or fetching now. */
const hasStarted = (
  cache: QueryClient,
  scope: string,
  personIds: readonly string[]
): boolean => {
  const state = activityState(cache, scope, personIds);
  return (
    state !== undefined &&
    (state.status !== "pending" || state.fetchStatus === "fetching")
  );
};

/**
 * The People list (Swift `PeopleDashboardModel`, the web's `usePeopleDashboard`):
 *
 * 1. The roster loads first, painting from the disk cache on a cold launch.
 * 2. The scope (Teams I lead, All teams, one team) picks people in roster order. A team scope
 *    loads whole up to 160 people; larger scopes load 48 and "Load more" adds 48.
 * 3. Activity loads 16 people a call, two calls at a time, each following its continuation.
 * 4. A search filters the whole scope at once; once typing pauses it asks for the first 16
 *    unloaded matches ahead of the rest of the sample.
 *
 * Reads run only while the screen is visible: leaving it (opening a person, another tab)
 * cancels calls in flight, and returning resumes them behind what is on screen.
 */
export const usePeopleDashboard = () => {
  const context = useProductClient();
  const { scope: accountScope } = context;
  const cache = useQueryClient();
  // Reads run while the screen is on screen and the account has the `people` flag.
  const isFocused = useReadVisibility();
  const features = useFeatures();
  const isActive = isFocused && features.people;
  const timeZone = useOrgTimeZone();
  const todayKey = formatCalendarDayInTimeZone(useClock().now(), timeZone);

  const rosterQuery = useVisibleQuery({
    ...peopleReads.roster(context),
    subscribed: isActive,
    enabled: isActive,
  });
  const roster = rosterQuery.data;
  const preferences = useVisibleQuery(peoplePreferencesQuery(accountScope));
  const scopeChoice = savedPeopleScope(preferences.data?.scope ?? null);
  const scope = effectiveScope(scopeChoice, roster);
  const scopePersonIds = useMemo(
    () => (roster === undefined ? [] : resolveScopePersonIds(roster, scope)),
    [roster, scope]
  );
  // "Load more" belongs to the scope it was asked in.
  const [extraPeople, setExtraPeople] = useState({ scope, count: 0 });
  const sampleCount = sampleSize(
    scope,
    scopePersonIds.length,
    extraPeople.scope === scope ? extraPeople.count : 0
  );
  const sampleBatches = useMemo(
    () =>
      planBatches(
        scopePersonIds,
        sampleCount,
        PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE
      ),
    [sampleCount, scopePersonIds]
  );

  const [searchText, setSearchText] = useState("");
  const normalizedQuery = normalizeQuery(searchText);
  const settledQuery = useSettledValue(normalizedQuery, SEARCH_LOAD_DELAY_MS);
  const [searchLoad, setSearchLoad] = useState<SearchLoad>({
    scope,
    query: "",
    batches: NO_BATCHES,
  });
  const searchBatches =
    searchLoad.scope === scope ? searchLoad.batches : NO_BATCHES;
  const requestedIds = useMemo(
    () => new Set([...sampleBatches.flat(), ...searchBatches.flat()]),
    [sampleBatches, searchBatches]
  );

  const batches = orderActivityBatches(sampleBatches, searchBatches, (ids) =>
    hasStarted(cache, accountScope, ids)
  );
  const batchQueries = useVisibleQueries({
    queries: batches.map((personIds, index) => {
      const gate = batches[index - PEOPLE_DASHBOARD_BATCH_CONCURRENCY];
      return {
        ...peopleReads.activity(context, personIds),
        // A call starts once the one two places ahead has settled.
        enabled: gate === undefined || isSettled(cache, accountScope, gate),
      };
    }),
    subscribed: isActive,
  });

  const activities = useMemo(
    () => batchQueries.flatMap((query) => query.data?.people ?? []),
    [batchQueries]
  );
  // Failed batches show their people as not loaded (with a retry), not as loading.
  const failedIdsKey = batches
    .flatMap((personIds, index) =>
      batchQueries[index]?.isError ? personIds : []
    )
    .join(",");
  const loadingIds = useMemo(() => {
    const failedIds = new Set(failedIdsKey.split(","));
    return new Set(
      [...requestedIds].filter((personId) => !failedIds.has(personId))
    );
  }, [failedIdsKey, requestedIds]);
  const dashboard = useMemo(
    () =>
      roster === undefined
        ? undefined
        : assembleDashboard(roster, activities, {
            scopePersonIds,
            sampleCount,
            loadingPersonIds: loadingIds,
          }),
    [activities, loadingIds, roster, sampleCount, scopePersonIds]
  );

  // A settled search asks for its first unloaded matches, once per scope and query.
  const searchIsCurrent =
    searchLoad.scope === scope && searchLoad.query === settledQuery;
  if (dashboard !== undefined && !searchIsCurrent) {
    const next = unrequestedMatchIds(
      dashboard.scopeRows,
      settledQuery,
      requestedIds
    ).slice(0, PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE);
    setSearchLoad({
      scope,
      query: settledQuery,
      batches: next.length > 0 ? [...searchBatches, next] : searchBatches,
    });
  }

  const searchRows = useMemo(
    () =>
      dashboard === undefined || normalizedQuery === ""
        ? []
        : dashboard.scopeRows.filter((row) =>
            matchesQuery(row, normalizedQuery)
          ),
    [dashboard, normalizedQuery]
  );
  // Counted once typing settles, after the search has asked for its first matches.
  const unrequestedMatchCount =
    dashboard === undefined || settledQuery !== normalizedQuery
      ? 0
      : unrequestedMatchIds(searchRows, normalizedQuery, requestedIds).length;

  const health = useMemo(
    () =>
      dashboard === undefined
        ? undefined
        : computeTeamHealth(dashboard.members, dashboard.teams, todayKey),
    [dashboard, todayKey]
  );
  // Signals for every loaded scope person, so search matches beyond the sample have them too.
  const scopeSignals = useMemo((): ReadonlyMap<
    string,
    readonly PersonSignal[]
  > => {
    if (dashboard === undefined) {
      return new Map();
    }
    const loaded = dashboard.scopeRows.flatMap((row) =>
      row.member === null ? [] : [row.member]
    );
    return computeTeamHealth(loaded, dashboard.teams, todayKey).signalsById;
  }, [dashboard, todayKey]);

  const failedBatches = batchQueries.filter((query) => query.isError);
  const isLoadingActivity = batchQueries.some((query) => query.isPending);
  const isLoadingSample = sampleBatches.some(
    (personIds) => !isSettled(cache, accountScope, personIds)
  );

  const selectScope = useCallback(
    (next: PeopleScope) => {
      savePeoplePreferences(cache, accountScope, { scope: next });
    },
    [cache, accountScope]
  );
  const loadMore = useCallback(() => {
    setExtraPeople((current) => ({
      scope,
      count:
        (current.scope === scope ? current.count : 0) +
        PEOPLE_DASHBOARD_SAMPLE_SIZE,
    }));
  }, [scope]);
  const loadMoreMatches = useCallback(() => {
    const [next] = chunkPersonIds(
      unrequestedMatchIds(searchRows, normalizedQuery, requestedIds),
      PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE
    );
    if (next !== undefined) {
      setSearchLoad({
        scope,
        query: settledQuery,
        batches: [...searchBatches, next],
      });
    }
  }, [
    normalizedQuery,
    requestedIds,
    scope,
    searchBatches,
    searchRows,
    settledQuery,
  ]);
  const retryFailed = useCallback(async () => {
    await runInTurns(
      failedBatches.map((query) => async () => {
        await query.refetch();
      }),
      PEOPLE_DASHBOARD_BATCH_CONCURRENCY
    );
  }, [failedBatches]);
  /** Pull to refresh: the roster, then every planned call again, still two at a time. */
  const refresh = useCallback(async () => {
    await rosterQuery.refetch();
    await runInTurns(
      batchQueries.map((query) => async () => {
        await query.refetch();
      }),
      PEOPLE_DASHBOARD_BATCH_CONCURRENCY
    );
  }, [batchQueries, rosterQuery]);

  const [sort, setSort] = useState<RosterSort>("name");
  const [show, setShow] = useState<PeopleShow>("everyone");
  const view = preferences.data?.view ?? "list";
  const setView = (next: PeopleView) => {
    savePeoplePreferences(cache, accountScope, { view: next });
  };

  return {
    scope,
    scopeLabel:
      dashboard === undefined
        ? "Your teams"
        : describeScope(scope, dashboard.teams, dashboard.ledTeamIds),
    selectScope,
    roster,
    dashboard,
    health,
    scopeSignals,
    todayKey,
    isRosterLoading: rosterQuery.isPending,
    rosterErrorMessage:
      rosterQuery.error !== null && roster === undefined
        ? failureMessage(rosterQuery.error)
        : null,
    isRetryingRoster: rosterQuery.isFetching,
    retryRoster: async () => {
      await rosterQuery.refetch();
    },
    isLoadingActivity,
    isLoadingSample,
    failedBatchCount: failedBatches.length,
    retryFailed,
    canLoadMore:
      roster !== undefined &&
      !isLoadingSample &&
      sampleCount < scopePersonIds.length,
    loadMore,
    searchText,
    setSearchText,
    isSearching: normalizedQuery !== "",
    searchRows,
    unrequestedMatchCount,
    loadMoreMatches,
    sort,
    setSort,
    show,
    setShow,
    view,
    setView,
    refresh,
  };
};

export type PeopleDashboardModel = ReturnType<typeof usePeopleDashboard>;

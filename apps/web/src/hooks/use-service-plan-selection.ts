import { speculativeQuery } from "@pcobooster/client/query";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useBrowserStorage } from "@/hooks/use-browser-storage";
import { useIntentPrefetch } from "@/hooks/use-intent-prefetch";
import { useMyScheduledPlans } from "@/hooks/use-my-scheduled-plans";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { createPlanItemsQueryOptions } from "@/hooks/use-plan-items";
import { createPlanTimesQueryOptions } from "@/hooks/use-plan-times";
import { useServiceTypes } from "@/hooks/use-service-types";
import { createTeamPositionsQueryOptions } from "@/hooks/use-team-positions";
import { isQueryFresh } from "@/lib/intent-prefetch";
import { hydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedPlansEntry,
  writeCachedPlans,
} from "@/lib/schedule-catalog-cache";
import { planWorkspaceLink } from "@/lib/schedule-navigation";
import type {
  DateRangeFilter,
  ServicePlanRow,
  ServicePlanTableSelectorProps,
} from "@/lib/service-plan-selection";
import {
  formatPlanDate,
  isInDateWindow,
  parsePlanDate,
  readStoredServiceTypeIds,
  SERVICE_TYPE_FILTER_STORAGE_KEY,
} from "@/lib/service-plan-selection";
import { productClient } from "@/product-client";

/** The positions, items, and times a plan's Overview is built from. */
const overviewQueryOptions = (row: ServicePlanRow) => ({
  teamPositions: createTeamPositionsQueryOptions(
    row.serviceTypeId,
    row.planId,
    row.seriesId
  ),
  planItems: createPlanItemsQueryOptions(row.serviceTypeId, row.planId),
  planTimes: createPlanTimesQueryOptions(row.serviceTypeId, row.planId),
});

export const useServicePlanSelection = ({
  selectedServiceTypeId,
  onSelect,
}: ServicePlanTableSelectorProps) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const cachedPlanWritesRef = useRef(new Map<string, number>());
  const orgTimeZone = useOrganizationTimeZone();
  const serviceTypesQuery = useServiceTypes();
  const { data: serviceTypes, isLoading: serviceTypesLoading } =
    serviceTypesQuery;
  // Starts with the service types rather than after the plans: it lists every upcoming plan
  // the person is on, and the rows are matched against it below.
  const myScheduledPlansQuery = useMyScheduledPlans();
  const { data: myScheduledPlans, isLoading: myScheduledPlansLoading } =
    myScheduledPlansQuery;
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);
  const [storedIds, setStoredIds] = useBrowserStorage(
    SERVICE_TYPE_FILTER_STORAGE_KEY
  );
  const selectedServiceTypeIds = useMemo(
    () => readStoredServiceTypeIds(storedIds),
    [storedIds]
  );
  const setSelectedServiceTypeIds = useCallback(
    (ids: string[]) => {
      setStoredIds(JSON.stringify(ids));
    },
    [setStoredIds]
  );
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("60");

  const allServiceTypeIds = useMemo(
    () => (serviceTypes ?? []).map((serviceType) => serviceType.id),
    [serviceTypes]
  );
  const validServiceTypeIdSet = useMemo(
    () => new Set(allServiceTypeIds),
    [allServiceTypeIds]
  );
  const effectiveSelectedServiceTypeIds = useMemo(() => {
    if (isNonEmptyString(selectedServiceTypeId)) {
      return validServiceTypeIdSet.has(selectedServiceTypeId)
        ? [selectedServiceTypeId]
        : [];
    }

    if (selectedServiceTypeIds === null) {
      return allServiceTypeIds;
    }

    return selectedServiceTypeIds.filter((id) => validServiceTypeIdSet.has(id));
  }, [
    allServiceTypeIds,
    selectedServiceTypeId,
    selectedServiceTypeIds,
    validServiceTypeIdSet,
  ]);

  const selectedServiceTypeIdSet = useMemo(
    () => new Set(effectiveSelectedServiceTypeIds),
    [effectiveSelectedServiceTypeIds]
  );

  const planQueryOptions = useMemo(
    () =>
      (serviceTypes ?? []).map((serviceType) => ({
        queryKey: queryKeys.plans(serviceType.id),
        queryFn: async ({ signal }: QueryFunctionContext) =>
          await productClient.call(
            "catalog.plans",
            { serviceTypeId: serviceType.id },
            { signal }
          ),
        staleTime: 5 * 60 * 1000,
        enabled: !!serviceTypes && selectedServiceTypeIdSet.has(serviceType.id),
      })),
    [selectedServiceTypeIdSet, serviceTypes]
  );

  // Saved plans seed their queries before `useQueries` reads them; see `useHydrateQueryFromCache`.
  for (const serviceType of serviceTypes ?? []) {
    if (selectedServiceTypeIdSet.has(serviceType.id)) {
      hydrateQueryFromCache(queryClient, queryKeys.plans(serviceType.id), () =>
        readCachedPlansEntry(serviceType.id)
      );
    }
  }
  const planQueries = useQueries({
    queries: planQueryOptions,
  });

  const rows = useMemo(() => {
    if (!serviceTypes) {
      return [];
    }

    const flattened: ServicePlanRow[] = [];

    for (const [index, serviceType] of serviceTypes.entries()) {
      if (!selectedServiceTypeIdSet.has(serviceType.id)) {
        continue;
      }

      const plans = planQueries[index]?.data ?? [];
      for (const plan of plans) {
        const sortDate = parsePlanDate(plan.sortDate);
        if (!sortDate) {
          continue;
        }

        flattened.push({
          serviceTypeId: serviceType.id,
          serviceTypeName: serviceType.name,
          serviceTypeSequence: serviceType.sequence,
          planId: plan.id,
          planTitle: plan.title,
          seriesTitle: plan.seriesTitle ?? null,
          seriesId: plan.seriesId ?? null,
          sortDate,
        });
      }
    }

    return flattened.toSorted((a, b) => {
      const byDate = a.sortDate.getTime() - b.sortDate.getTime();
      if (byDate !== 0) {
        return byDate;
      }

      const byServiceOrder = a.serviceTypeSequence - b.serviceTypeSequence;
      if (byServiceOrder !== 0) {
        return byServiceOrder;
      }

      const byServiceName = a.serviceTypeName.localeCompare(b.serviceTypeName);
      if (byServiceName !== 0) {
        return byServiceName;
      }

      return a.planTitle.localeCompare(b.planTitle);
    });
  }, [planQueries, selectedServiceTypeIdSet, serviceTypes]);

  const myScheduledPlanIdSet = useMemo(
    () => new Set(myScheduledPlans?.planIds),
    [myScheduledPlans?.planIds]
  );

  const plansLoading = planQueries.some((query) => query.isLoading);
  const failedQueries = [
    { title: "Couldn't load service types", query: serviceTypesQuery },
    { title: "Couldn't load your services", query: myScheduledPlansQuery },
    ...planQueries.flatMap((query, index) => {
      const serviceType = serviceTypes?.[index];
      return serviceType !== undefined &&
        selectedServiceTypeIdSet.has(serviceType.id)
        ? [{ title: `Couldn't load ${serviceType.name} plans`, query }]
        : [];
    }),
  ].filter(({ query }) => query.error !== null);
  const errorMessage = failedQueries[0]?.query.error ?? undefined;
  // Service types answer at different times, and each one's plans interleave by date, so
  // showing rows as they arrive reshuffles the list under the pointer. The page stays on its
  // skeleton until every selected service type and the "Your services" lookup have answered,
  // then shows them together. Later, a service type added to the filter keeps the current rows
  // on screen, with the loading bar, until its plans arrive.
  const everythingLoaded =
    !serviceTypesLoading && !plansLoading && !myScheduledPlansLoading;
  const [hasLoaded, setHasLoaded] = useState(everythingLoaded);
  if (everythingLoaded && !hasLoaded) {
    setHasLoaded(true);
  }
  const isInitialLoading = !hasLoaded;
  const isRefreshing = hasLoaded && plansLoading;

  const myScheduledRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          myScheduledPlanIdSet.has(row.planId) &&
          isInDateWindow(row.sortDate, dateRangeFilter, orgTimeZone)
      ),
    [dateRangeFilter, myScheduledPlanIdSet, orgTimeZone, rows]
  );

  const visibleRows = useMemo(() => {
    const normalizedSearch = deferredSearchValue.trim().toLowerCase();

    return rows.filter((row) => {
      if (selectedServiceTypeIdSet.size === 0) {
        return false;
      }
      if (!selectedServiceTypeIdSet.has(row.serviceTypeId)) {
        return false;
      }

      if (!isInDateWindow(row.sortDate, dateRangeFilter, orgTimeZone)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        row.serviceTypeName,
        row.planTitle,
        row.seriesTitle ?? "",
        formatPlanDate(row.sortDate, orgTimeZone),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [
    dateRangeFilter,
    deferredSearchValue,
    orgTimeZone,
    rows,
    selectedServiceTypeIdSet,
  ]);

  useEffect(() => {
    if (!serviceTypes) {
      return;
    }
    for (const [index, serviceType] of serviceTypes.entries()) {
      const query = planQueries[index];
      const plans = query?.data;
      if (!plans) {
        continue;
      }
      const { dataUpdatedAt } = query;
      if (cachedPlanWritesRef.current.get(serviceType.id) === dataUpdatedAt) {
        continue;
      }
      writeCachedPlans(serviceType.id, plans);
      cachedPlanWritesRef.current.set(serviceType.id, dataUpdatedAt);
    }
  }, [planQueries, serviceTypes]);

  /** On hover: what the plan's Overview shows, the view a plan opens on. */
  const prefetchPlanData = useCallback(
    async (row: ServicePlanRow) => {
      // Warm the route too, so its code is ready before the click.
      void router.preloadRoute(
        planWorkspaceLink(row.serviceTypeId, row.planId)
      );
      const { teamPositions, planItems, planTimes } = overviewQueryOptions(row);
      await Promise.allSettled([
        queryClient.query(speculativeQuery(teamPositions)),
        queryClient.query(speculativeQuery(planItems)),
        queryClient.query(speculativeQuery(planTimes)),
      ]);
    },
    [queryClient, router]
  );
  const isPlanDataFresh = useCallback(
    (row: ServicePlanRow) =>
      Object.values(overviewQueryOptions(row)).every((options) =>
        isQueryFresh(queryClient, options.queryKey, options.staleTime)
      ),
    [queryClient]
  );
  const { getIntentProps: getPlanIntentProps, cancelIntent } =
    useIntentPrefetch<ServicePlanRow>({
      keyOf: (row) => `${row.serviceTypeId}:${row.planId}`,
      isFresh: isPlanDataFresh,
      prefetch: prefetchPlanData,
    });
  /**
   * Opening a plan lands on its Overview, so its data starts loading at the click, ahead of
   * the route's code. The workspace warms the other views in the speculative lane once it has
   * loaded.
   */
  const loadOpenedPlan = useCallback(
    async (row: ServicePlanRow) => {
      // The workspace's own queries own any visible loading error.
      const { teamPositions, planItems, planTimes } = overviewQueryOptions(row);
      await Promise.allSettled([
        queryClient.query(teamPositions),
        queryClient.query(planItems),
        queryClient.query(planTimes),
      ]);
    },
    [queryClient]
  );

  const handleSelectRow = useCallback(
    (row: ServicePlanRow) => {
      cancelIntent();
      void loadOpenedPlan(row);
      onSelect({
        serviceTypeId: row.serviceTypeId,
        planId: row.planId,
      });
    },
    [cancelIntent, loadOpenedPlan, onSelect]
  );

  return {
    searchValue,
    setSearchValue,
    serviceTypes,
    effectiveSelectedServiceTypeIds,
    setSelectedServiceTypeIds,
    dateRangeFilter,
    setDateRangeFilter,
    isInitialLoading,
    isRefreshing,
    errorMessage,
    failedQueries,
    visibleRows,
    myScheduledRows,
    myScheduledPlanIdSet,
    handleSelectRow,
    getPlanIntentProps,
    orgTimeZone,
  };
};
